/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Legacy data migration for the simulated SQLite vault database.
 *
 * Migration sources, in order:
 *   1. IndexedDB local fallback mirror (previous SQLite state).
 *   2. Legacy plaintext localStorage keys (`aegis_master_password`,
 *      `aegis_vault_items`, `aegis_is_setup`) — migrated once into
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
import { LOCAL_FALLBACK_KEY } from './sqliteOpfsPersistence';

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
    try {
      const parsed = JSON.parse(fallback);
      if (!parsed.desktopManaged) {
        logSecurityEvent(securityEventCodes.storageLocalFallbackUsed, 'Loaded vault state from local fallback mirror.', 'warning');
        return parseVaultDatabaseState(fallback);
      }
    } catch {}
  }

  // Attempt to seed from standard legacy keys
  const isSetup = localStorage.getItem('aegis_is_setup') === 'true';
  const legacyPass = localStorage.getItem('aegis_master_password');
  const legacyItemsStr = localStorage.getItem('aegis_vault_items');

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
        localStorage.removeItem('aegis_master_password');
        localStorage.removeItem('aegis_vault_items');
        localStorage.removeItem('aegis_is_setup');
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
 * Security fix Y3: Purge stale legacy plaintext localStorage keys.
 * For users who migrated in a previous version without the cleanup,
 * this removes any remaining plaintext data if the SQLite store is populated.
 */
export function purgeStaleLegacyLocalStorageKeys(state: VersionedVaultDatabaseState): void {
  try {
    const hasLegacyPassword = localStorage.getItem('aegis_master_password');
    const hasLegacyItems = localStorage.getItem('aegis_vault_items');

    if (hasLegacyPassword || hasLegacyItems) {
      // Only purge if we already have vault data in SQLite (i.e., migration happened before)
      if (state.vault_items.length > 0 || state.user_secrets.length > 0) {
        localStorage.removeItem('aegis_master_password');
        localStorage.removeItem('aegis_vault_items');
        localStorage.removeItem('aegis_is_setup');
        logSecurityEvent(
          securityEventCodes.storageLegacyDataPurged,
          'Stale legacy plaintext localStorage keys purged (post-migration cleanup).',
          'info',
        );
      }
    }
  } catch {
    // Silently ignore — localStorage may not be available in all contexts
  }
}
