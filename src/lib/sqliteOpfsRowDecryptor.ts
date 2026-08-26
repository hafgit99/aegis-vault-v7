/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Row decryption engine for the simulated SQLite vault database.
 *
 * Decrypts `enc_metadata` payloads under per-item HKDF keys with a
 * strictly one-time raw-master-key fallback for pre-HKDF rows (the row
 * is re-encrypted under its per-item key immediately). Also performs
 * legacy KDF / static-salt migration re-encryption when requested.
 *
 * The module is pure with respect to the repository: rows are mutated
 * in place (upgrades), the decrypted-items cache is updated through the
 * provided Map reference, and no persistence happens here.
 */

import type { VaultItem } from '../types';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt, generateSafeIv, derivePerItemKey, type WebCryptoAesGcmPayload } from './webcrypto';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import type { VaultDatabaseRow } from './vaultDatabaseFormat';
import { maybeDelay, VAULT_ITEM_KDF } from './sqliteOpfsShared';

export interface VaultRowMigrationOptions {
  migrationKey: Uint8Array;
  migratedSalt: string | null;
  shouldMigrateKdf: boolean;
  shouldMigrateStaticSalt: boolean;
}

export interface DecryptVaultRowsOptions {
  rows: VaultDatabaseRow[];
  cache: Map<string, { enc_metadata: string; item: VaultItem }>;
  derivedKey: Uint8Array;
  migration?: VaultRowMigrationOptions;
}

export interface DecryptVaultRowsOutcome {
  results: Array<{ row: VaultDatabaseRow; item: VaultItem }>;
  /** At least one row was upgraded/migrated and must be persisted. */
  migratedLegacyRows: boolean;
}

/** Placeholder title/username used for rows that fail to decrypt. */
const DECRYPTION_FAILURE_PLACEHOLDER = '[encrypted: aes-256-gcm]';

function buildFailureFallbackItem(row: VaultDatabaseRow): VaultItem {
  return {
    id: row.id,
    title: DECRYPTION_FAILURE_PLACEHOLDER,
    username: DECRYPTION_FAILURE_PLACEHOLDER,
    url: '',
    category: (row.category as VaultItem['category']) || 'login',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    favorite: row.favorite === 1,
    deleted: row.deleted === 1,
  };
}

/**
 * Decrypts all vault rows sequentially, yielding to the event loop every
 * ten real decryptions to keep the main thread responsive on large vaults.
 */
export async function decryptVaultRows(options: DecryptVaultRowsOptions): Promise<DecryptVaultRowsOutcome> {
  const { rows, cache, derivedKey } = options;
  const shouldMigrateKdf = options.migration?.shouldMigrateKdf ?? false;
  const shouldMigrateStaticSalt = options.migration?.shouldMigrateStaticSalt ?? false;
  const migrationKey = options.migration?.migrationKey ?? derivedKey;

  let migratedLegacyRows = false;
  const results: Array<{ row: VaultDatabaseRow; item: VaultItem }> = [];

  // For very large datasets (600+ items), process decryption sequentially (not in parallel)
  // with frequent yielding to absolutely prevent main thread blocking.
  // Trade-off: Slower but zero UI freezing.
  const totalItems = rows.length;
  let decryptCount = 0;

  for (let i = 0; i < totalItems; i++) {
    const row = rows[i];
    if (!row) continue;

    try {
      const cachedEntry = cache.get(row.id);
      const isLegacyRow = row.enc_kdf !== VAULT_ITEM_KDF;
      let decryptedJson: string;
      let usedLegacyMasterKeyFallback = false;

      if (cachedEntry && cachedEntry.enc_metadata === row.enc_metadata && !shouldMigrateStaticSalt && !shouldMigrateKdf) {
        results.push({ row, item: cachedEntry.item });
      } else {
        if (cachedEntry && cachedEntry.enc_metadata === row.enc_metadata) {
          decryptedJson = JSON.stringify(cachedEntry.item);
        } else {
          if (isLegacyRow) {
            logSecurityEvent(
              securityEventCodes.securityLegacyCryptoWarning,
              'Legacy custom-crypto SQLite rows are no longer decrypted in this build. Re-export from an earlier migration build first.',
              'critical'
            );
            throw new Error('legacy-custom-crypto-row-unsupported');
          }
          const encryptedPayload: WebCryptoAesGcmPayload = JSON.parse(row.enc_metadata);
          const itemKey = await derivePerItemKey(derivedKey, row.id);
          try {
            decryptedJson = await webCryptoAesGcmDecrypt(encryptedPayload, itemKey);
          } catch {
            // Pre-HKDF rows were encrypted with the raw derived key. The
            // fallback is allowed once per row: the row is immediately
            // re-encrypted under its per-item key below.
            decryptedJson = await webCryptoAesGcmDecrypt(encryptedPayload, derivedKey);
            usedLegacyMasterKeyFallback = true;
          } finally {
            itemKey.fill(0);
          }
        }

        const originalItem: VaultItem = JSON.parse(decryptedJson);

        if (usedLegacyMasterKeyFallback) {
          // One-time upgrade: re-encrypt the row under its per-item key so
          // the raw-master-key fallback never fires again for this row.
          const upgradeKey = await derivePerItemKey(derivedKey, row.id);
          const upgraded = await webCryptoAesGcmEncrypt(decryptedJson, upgradeKey, generateSafeIv());
          upgradeKey.fill(0);
          row.enc_metadata = JSON.stringify(upgraded);
          row.enc_kdf = VAULT_ITEM_KDF;
          migratedLegacyRows = true;
          logSecurityEvent(
            securityEventCodes.securityLegacyCryptoWarning,
            `Vault item ${row.id} decrypted via legacy master-key fallback and re-encrypted with a per-item key.`,
            'warning',
            { itemId: row.id },
          );
        }

        if (isLegacyRow || shouldMigrateStaticSalt || shouldMigrateKdf) {
          const itemMigrationKey = await derivePerItemKey(migrationKey, row.id);
          const encrypted = await webCryptoAesGcmEncrypt(decryptedJson, itemMigrationKey, generateSafeIv());
          itemMigrationKey.fill(0);
          row.enc_metadata = JSON.stringify(encrypted);
          row.enc_kdf = VAULT_ITEM_KDF;
          migratedLegacyRows = true;
        }

        cache.set(row.id, {
          enc_metadata: row.enc_metadata,
          item: originalItem,
        });

        results.push({ row, item: originalItem });
        decryptCount++;
      }
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logSecurityEvent(
        securityEventCodes.storageLegacyMigrationFailed,
        `Decryption failed for vault item ${row.id}: ${errorMessage}`,
        'warning',
        { itemId: row.id, error: errorMessage },
      );
      results.push({ row, item: buildFailureFallbackItem(row) });
      decryptCount++;
    }

    // Yield only if we are doing actual decryption work to prevent UI freezing
    if (decryptCount > 0 && decryptCount % 10 === 0) {
      await maybeDelay(10);
      decryptCount = 0;
    }
  }

  return { results, migratedLegacyRows };
}
