/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Legacy data migration for the simulated SQLite vault database.
 *
 * Migration sources, in order:
 *   1. IndexedDB local fallback mirror (previous SQLite state).
 *   2. Legacy plaintext localStorage keys (`KalderaShield_master_password`,
 *      `KalderaShield_vault_items`, `KalderaShield_is_setup`) — migrated once into
 *      encrypted relational rows, then purged (rollback-safe).
 *
 * This module is pure with respect to the repository: it receives the
 * current state and a KDF hook, and returns the resulting state.
 */

import type { VaultItem } from '../types';
import { createArgon2idHash } from './argon2id';
import { webCryptoAesGcmEncrypt, generateSafeIv } from './webcrypto';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import {
  normalizeVaultDatabaseState,
  parseVaultDatabaseState,
  type VersionedVaultDatabaseState,
} from './vaultDatabaseFormat';
import { buildVaultItemRow, createVaultEncryptionSalt } from './sqliteOpfsShared';
import { getIndexedDbItemSync } from './indexedDbStorage';
import {
  reportFallbackMirrorRecovery,
  LOCAL_FALLBACK_KEY,
} from './sqliteOpfsPersistence';

export interface SqliteOpfsMigrationDeps {
  /** Derives the vault encryption key for the given password (uses the live salt). */
  deriveEncryptionKey(password: string): Promise<Uint8Array>;
  logQuery(query: string, status: 'SUCCESS' | 'ERROR', rowsAffected: number): void;
}

/**
 * Migrate legacy plaintext vault items into relational SQLite rows with GCM encryption.
 * Returns the resulting state; the caller assigns it back to the repository.
 */
export async function migrateLegacyLocalStorage(
  currentState: VersionedVaultDatabaseState,
  deps: SqliteOpfsMigrationDeps,
): Promise<VersionedVaultDatabaseState> {
  const fallback = getIndexedDbItemSync(LOCAL_FALLBACK_KEY);
  if (fallback) {
    // Only the parse is guarded. The staleness check used to sit inside this
    // `try`, which was a mistake: the `catch {}` swallowed its failure and the
    // mirror was then never loaded at all. A diagnostic must not be able to
    // change what the app does with the user's data.
    let parsed: { desktopManaged?: unknown } | null = null;
    try {
      parsed = JSON.parse(fallback);
    } catch {
      parsed = null;
    }
    if (parsed && !parsed.desktopManaged) {
      logSecurityEvent(securityEventCodes.storageLocalFallbackUsed, 'Loaded vault state from local fallback mirror.', 'warning');
      // O-2: a mirror that silently fell behind the authoritative copy used to
      // be loaded here and reported as an ordinary successful load. It is still
      // the only copy when the authoritative store is genuinely absent, so it is
      // still used -- but its age is now announced, because "your backup is
      // older than your vault" is exactly what a user cannot see.
      reportFallbackMirrorRecovery();
      // O-3: this early return used to skip the legacy cleanup entirely, which
      // left a second door open onto the same orphaned password. Reuse the
      // one purge so both exits behave identically.
      purgeStaleLegacyLocalStorageKeys(currentState);
      return parseVaultDatabaseState(fallback);
    }
  }

  // Attempt to seed from standard legacy keys
  const isSetup = localStorage.getItem('KalderaShield_is_setup') === 'true';
  const legacyPass = localStorage.getItem('KalderaShield_master_password');
  const legacyItemsStr = localStorage.getItem('KalderaShield_vault_items');

  if (isSetup && legacyPass && legacyItemsStr) {
    try {
      const passwordPlain = atob(legacyPass);
      const argonHash = await createArgon2idHash(passwordPlain, createVaultEncryptionSalt());

      currentState.user_secrets = [{
        username: 'owner',
        argon_hash: argonHash,
      }];

      const items: VaultItem[] = JSON.parse(legacyItemsStr);
      currentState.encryption_salt = createVaultEncryptionSalt();
      const derivedKey = await deps.deriveEncryptionKey(passwordPlain);

      currentState.vault_items = await Promise.all(items.map(async (item) => {
        const sensitivePayload = JSON.stringify(item);
        const encrypted = await webCryptoAesGcmEncrypt(sensitivePayload, derivedKey, generateSafeIv());

        return buildVaultItemRow({
          id: item.id,
          encrypted,
          item,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        });
      }));

      deps.logQuery('CREATE TABLE vault_items (id TEXT PRIMARY KEY, title TEXT, category TEXT, favorite INTEGER, deleted INTEGER, username_db TEXT, password_db TEXT, enc_metadata TEXT);', 'SUCCESS', currentState.vault_items.length);

      // Security fix Y3: Purge legacy plaintext keys after successful migration.
      // These contain base64-encoded master password and unencrypted vault items.
      // Only delete AFTER migration succeeds to preserve rollback safety.
      try {
        localStorage.removeItem('KalderaShield_master_password');
        localStorage.removeItem('KalderaShield_vault_items');
        localStorage.removeItem('KalderaShield_is_setup');
        logSecurityEvent(
          securityEventCodes.storageLegacyDataPurged,
          'Legacy plaintext localStorage keys purged after successful migration.',
          'info',
        );
      } catch (purgeErr) {
        // Non-fatal: log but don't block the migration
        logSecurityEvent(
          securityEventCodes.storageLegacyMigrationFailed,
          'Failed to purge legacy localStorage keys after migration.',
          'warning',
          { error: purgeErr instanceof Error ? purgeErr.message : String(purgeErr) },
        );
      }
    } catch (e) {
      // Migration failed — do NOT delete legacy keys (rollback safety)
      logSecurityEvent(
        securityEventCodes.storageLegacyMigrationFailed,
        'Legacy localStorage vault migration failed.',
        'critical',
        { error: e instanceof Error ? e.message : String(e) },
      );
    }
  } else {
    // Security fix Y3: One-time cleanup for users who previously migrated
    // but never had the plaintext purge applied. If SQLite state already
    // has vault items (migration was done before), clean up stale keys.
    purgeStaleLegacyLocalStorageKeys(currentState);
  }

  return normalizeVaultDatabaseState(currentState);
}

/**
 * Security fix Y3 / O-3: Purge stale legacy plaintext localStorage keys.
 * For users who migrated in a previous version without the cleanup,
 * this removes any remaining plaintext data if the SQLite store is populated.
 */
export function purgeStaleLegacyLocalStorageKeys(state: VersionedVaultDatabaseState): void {
  try {
    const hasLegacyPassword = localStorage.getItem('KalderaShield_master_password');
    const hasLegacyItems = localStorage.getItem('KalderaShield_vault_items');

    if (!hasLegacyPassword && !hasLegacyItems) {
      return;
    }

    const vaultPopulated = state.vault_items.length > 0 || state.user_secrets.length > 0;

    if (vaultPopulated) {
      // Only purge if we already have vault data in SQLite (i.e., migration happened before)
      localStorage.removeItem('KalderaShield_master_password');
      localStorage.removeItem('KalderaShield_vault_items');
      localStorage.removeItem('KalderaShield_is_setup');
      logSecurityEvent(
        securityEventCodes.storageLegacyDataPurged,
        'Stale legacy plaintext localStorage keys purged (post-migration cleanup).',
        'info',
      );
      return;
    }

    // O-3: the legacy password with no items to migrate is inert residue, and
    // the original code refused to touch it.
    //
    // The reason it survived is a size asymmetry worth stating plainly:
    // `KalderaShield_master_password` is a few dozen base64 bytes, `KalderaShield_vault_items`
    // is the entire vault and can be megabytes. Under storage pressure a
    // browser evicts the large key and keeps the small one - so the single key
    // that must never outlive migration is the one most likely to. Once the
    // items blob is gone there is nothing left to migrate and the password
    // cannot unlock anything, yet it sits there in base64 indefinitely.
    //
    // Gating this on `KalderaShield_vault_items` being present was the bug, not the
    // safeguard: the condition that made the purge safe was "the password is
    // not the only copy of the data", and the absence of items satisfies that
    // just as well as the presence of a populated store.
    if (hasLegacyPassword && !hasLegacyItems) {
      localStorage.removeItem('KalderaShield_master_password');
      logSecurityEvent(
        securityEventCodes.storageLegacyDataPurged,
        'Orphaned legacy master password purged (no legacy items remained to migrate).',
        'info',
      );
    }
  } catch {
    // Silently ignore — localStorage may not be available in all contexts
  }
}
