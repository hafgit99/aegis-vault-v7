/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import { secureRandomToken } from './random';
import {
  createEmptyVaultDatabaseState,
  type VaultDatabaseRow,
  type VersionedVaultDatabaseState,
} from './vaultDatabaseFormat';
import { createArgon2idHash, verifyArgon2idHash, enforceMinimumKdfFloor, type Argon2idOptions } from './argon2id';
import { deriveArgon2idKey as deriveVettedArgon2idKey } from './argon2id';
import { reWrapPasskeysInVaultItems } from './passkey';
import { webCryptoAesGcmEncrypt, generateSafeIv, derivePerItemKey } from './webcrypto';
import {
  getNativeVaultStorageScope,
  resetDesktopVaultDatabase,
} from './desktopStorage';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import { registerOnCloseSession } from './vaultSession';
import { removeIndexedDbItemSync } from './indexedDbStorage';
import type {
  SQLCommandLog,
  SQLCommandStatus,
  VaultStorageQueryResult,
  VaultStorageRepository,
} from './vaultStorageRepository';
import {
  areByteArraysEqual,
  buildVaultItemRow,
  createVaultEncryptionSalt,
  LEGACY_VAULT_ITEM_KDF_PARAMS,
  LEGACY_VAULT_ITEM_KDF_SALT,
  maybeDelay,
  NEW_VAULT_ITEM_KDF_PARAMS,
  sanitizeLogValue,
  sanitizeQueryForLog,
} from './sqliteOpfsShared';
import { decryptVaultRows } from './sqliteOpfsRowDecryptor';
import {
  LOCAL_FALLBACK_KEY,
  loadPersistedVaultDatabase,
  persistVaultDatabase,
  type PersistedLoadResult,
} from './sqliteOpfsPersistence';
import {
  migrateLegacyLocalStorage as runLegacyLocalStorageMigration,
} from './sqliteOpfsMigration';

/**
 * SQLite simulated schema and data manager storing DB blocks in private OPFS.
 */
export type SQLiteRow = VaultDatabaseRow;


class SQLiteOPFS implements VaultStorageRepository {  private state: VersionedVaultDatabaseState = createEmptyVaultDatabaseState();

  private logs: SQLCommandLog[] = [];
  private onLogsChangedCallbacks: (() => void)[] = [];
  private hydratePromise: Promise<void>;

  // KDF derived key cache to avoid repeating heavy Argon2id calculations
  private cachedPasswordBytes: Uint8Array | null = null;
  private cachedKeySalt: string | null = null;
  private cachedKeyBytes: Uint8Array | null = null;

  // Decrypted items cache Map: row.id -> { enc_metadata: string, item: VaultItem }
  private decryptedItemsCache = new Map<string, { enc_metadata: string; item: VaultItem }>();
  private lastCacheTimestamp = Date.now();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  constructor() {
    this.hydratePromise = this.loadFromPersistentStorage();
    registerOnCloseSession(() => {
      this.clearDerivedKeyCache();
    });
  }

  public async hydrate(): Promise<void> {
    await this.hydratePromise;
  }

  private checkCacheTtl(): void {
    if (Date.now() - this.lastCacheTimestamp > this.CACHE_TTL_MS) {
      this.decryptedItemsCache.clear();
      this.lastCacheTimestamp = Date.now();
    }
  }

  public clearDerivedKeyCache(): void {
    if (this.cachedKeyBytes) {
      this.cachedKeyBytes.fill(0);
    }
    if (this.cachedPasswordBytes) {
      this.cachedPasswordBytes.fill(0);
    }
    this.cachedPasswordBytes = null;
    this.cachedKeySalt = null;
    this.cachedKeyBytes = null;
    this.decryptedItemsCache.clear();
    this.lastCacheTimestamp = Date.now();
  }


  // Registers callback for console query updates
  public subscribeLogs(callback: () => void): () => void {
    this.onLogsChangedCallbacks.push(callback);
    return () => {
      this.onLogsChangedCallbacks = this.onLogsChangedCallbacks.filter(c => c !== callback);
    };
  }

  private notifyLogsChanged() {
    this.onLogsChangedCallbacks.forEach(cb => cb());
  }

  public getQueryLogs(): SQLCommandLog[] {
    return [...this.logs].reverse().slice(0, 50); // Get latest 50 queries
  }

  public logQuery(query: string, status: SQLCommandStatus, rowsAffected: number) {
    this.logs.push({
      id: secureRandomToken(7),
      timestamp: new Date().toLocaleTimeString(),
      query: sanitizeQueryForLog(query),
      status,
      rowsAffected,
    });
    this.notifyLogsChanged();
  }

  private ensureVaultEncryptionSalt(): string {
    this.state.encryption_salt ??= createVaultEncryptionSalt();
    return this.state.encryption_salt;
  }

  public getCurrentVaultEncryptionSalt(): string {
    return this.state.encryption_salt || LEGACY_VAULT_ITEM_KDF_SALT;
  }

  public getArgonHash(): string {
    return this.state.user_secrets[0]?.argon_hash || '';
  }

  private cloneState(): VersionedVaultDatabaseState {
    return JSON.parse(JSON.stringify(this.state)) as VersionedVaultDatabaseState;
  }

  private cloneDecryptedItemsCache(): Map<string, { enc_metadata: string; item: VaultItem }> {
    return new Map(Array.from(this.decryptedItemsCache.entries()).map(([id, entry]) => [
      id,
      {
        enc_metadata: entry.enc_metadata,
        item: { ...entry.item },
      },
    ]));
  }

  private restoreTransactionalState(
    state: VersionedVaultDatabaseState,
    decryptedItemsCache: Map<string, { enc_metadata: string; item: VaultItem }>,
  ): void {
    this.state = state;
    this.clearDerivedKeyCache();
    this.decryptedItemsCache = decryptedItemsCache;
  }

  /**
   * Loads SQLite file from OPFS (Origin Private File System) sandboxed directory.
   */
  private async loadFromPersistentStorage() {
    const result = await loadPersistedVaultDatabase().catch((err: unknown): PersistedLoadResult => {
      logSecurityEvent(
        securityEventCodes.storageDesktopReadFailed,
        'Persistent desktop storage could not be loaded; trying local fallback.',
        'warning',
        { error: err instanceof Error ? err.message : String(err) },
      );
      return { kind: 'unavailable' };
    });

    if (result.kind === 'state') {
      this.state = result.state;
      this.logQuery(result.logLabel, 'SUCCESS', 1);
      if (result.resaveAfterLoad) {
        await this.saveToPersistentStorage();
      }
      return;
    }

    if (result.kind === 'missing') {
      // File does not exist yet. Initialize using the fallback mirror or start fresh.
      await this.migrateLegacyLocalStorage();
      await this.saveToPersistentStorage();
      return;
    }

    if (result.kind === 'unavailable') {
      // Fallback to standard sandbox-compliant simulated OPFS persistence.
      await this.migrateLegacyLocalStorage();
    }
    // kind === 'empty': nothing to load and nothing to migrate.
  }

  /**
   * Saves raw DB state to private OPFS.
   */
  private async saveToPersistentStorage(): Promise<boolean> {
    return persistVaultDatabase(this.state);
  }

  /**
   * Migrate legacy plaintext vault items into relational SQLite rows with GCM encryption.
   */
  private async migrateLegacyLocalStorage() {
    this.state = await runLegacyLocalStorageMigration(this.state, {
      deriveEncryptionKey: (password) => this.deriveEncryptionKey(password),
      logQuery: (query, status, rowsAffected) => this.logQuery(query, status, rowsAffected),
    });
  }

  /**
   * Verifies the user's password using the strict Argon2id scheme.
   */
  public async verifyPassword(password: string): Promise<boolean> {
    await this.hydrate();
    this.logQuery('SELECT argon_hash FROM user_secrets WHERE username = "owner";', 'SUCCESS', 1);
    if (this.state.user_secrets.length === 0) {
      return false;
    }
    const expectedHash = this.state.user_secrets[0]!.argon_hash;
    if (expectedHash.startsWith('$argon2id$')) {
      const isVettedMatch = await verifyArgon2idHash(password, expectedHash);
      if (isVettedMatch) {
        return true;
      }
    }
    return false;
  }

  /**
   * Configures primary master verification keys.
   */
  public async setupMaster(password: string): Promise<void> {
    await this.hydrate();
    const argonHash = await createArgon2idHash(password, createVaultEncryptionSalt());
    this.state.encryption_salt = createVaultEncryptionSalt();
    this.state.kdfParams = NEW_VAULT_ITEM_KDF_PARAMS;
    this.state.user_secrets = [{
      username: 'owner',
      argon_hash: argonHash,
    }];
    this.logQuery('INSERT INTO user_secrets (username, argon_hash) VALUES ("owner", "[argon2id verification hash]");', 'SUCCESS', 1);
    await this.saveToPersistentStorage();
  }

  public async setupMasterWithHash(argonHash: string, salt: string, kdfParams?: VersionedVaultDatabaseState['kdfParams']): Promise<void> {
    await this.hydrate();
    this.state.encryption_salt = salt;
    this.state.kdfParams = kdfParams;
    this.state.user_secrets = [{
      username: 'owner',
      argon_hash: argonHash,
    }];
    this.logQuery('INSERT INTO user_secrets (username, argon_hash) VALUES ("owner", "[argon2id verification hash]");', 'SUCCESS', 1);
    await this.saveToPersistentStorage();
  }

  /**
   * Rotates the vault master credential without wiping saved records.
   */
  public async changeMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
    await this.hydrate();
    const isCurrentPasswordValid = await this.verifyPassword(oldPassword);
    if (!isCurrentPasswordValid) {
      this.logQuery('UPDATE user_secrets SET argon_hash = "[rekey blocked: invalid current password]";', 'ERROR', 0);
      throw new Error('current-master-password-invalid');
    }

    const items = await this.getVaultItems(oldPassword);
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      const argonHash = await createArgon2idHash(newPassword, createVaultEncryptionSalt());
      this.clearDerivedKeyCache();
      this.state.encryption_salt = createVaultEncryptionSalt();
      this.state.kdfParams = NEW_VAULT_ITEM_KDF_PARAMS;
      this.state.user_secrets = [{
        username: 'owner',
        argon_hash: argonHash,
      }];

      const oldDerivedKey = await this.deriveEncryptionKey(oldPassword);
      const derivedKey = await this.deriveEncryptionKey(newPassword);
      const reWrappedItems = await reWrapPasskeysInVaultItems(items, oldDerivedKey, derivedKey);
      oldDerivedKey.fill(0);

      this.state.vault_items = await Promise.all(reWrappedItems.map(async (item) => {
        const encrypted = await webCryptoAesGcmEncrypt(JSON.stringify(item), derivedKey, generateSafeIv());
        const nowStr = new Date().toISOString().split('T')[0] ?? '';

        return buildVaultItemRow({
          id: item.id || secureRandomToken(9),
          encrypted,
          item,
          createdAt: item.createdAt || nowStr,
          updatedAt: item.updatedAt || nowStr,
        });
      }));

      this.decryptedItemsCache.clear();
      for (const item of items) {
        const row = this.state.vault_items.find((candidate) => candidate.id === item.id);
        if (row) {
          this.decryptedItemsCache.set(row.id, {
            enc_metadata: row.enc_metadata,
            item,
          });
        }
      }

      const persisted = await this.saveToPersistentStorage();
      if (!persisted) {
        throw new Error('master-password-rotation-persist-failed');
      }

      this.logQuery('UPDATE user_secrets SET argon_hash = "[rotated argon2id verification hash]"; REKEY vault_items;', 'SUCCESS', items.length);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery('UPDATE user_secrets SET argon_hash = "[rekey rolled back: persistence failed]"; REKEY vault_items;', 'ERROR', 0);
      if (err instanceof Error && err.message === 'master-password-rotation-persist-failed') {
        throw err;
      }
      throw new Error('master-password-rotation-failed');
    }
  }

  public async changeMasterPasswordWithHash(
    newArgonHash: string,
    newSalt: string,
    kdfParams: VersionedVaultDatabaseState['kdfParams'],
    oldVaultKey: Uint8Array,
    newVaultKey: Uint8Array,
  ): Promise<void> {
    await this.hydrate();
    const items = await this.getVaultItemsWithKey(oldVaultKey);
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      this.clearDerivedKeyCache();
      this.state.encryption_salt = newSalt;
      this.state.kdfParams = kdfParams;
      this.state.user_secrets = [{
        username: 'owner',
        argon_hash: newArgonHash,
      }];

      this.state.vault_items = await Promise.all(items.map(async (item) => {
        const encrypted = await webCryptoAesGcmEncrypt(JSON.stringify(item), newVaultKey, generateSafeIv());
        const nowStr = new Date().toISOString().split('T')[0] ?? '';

        return buildVaultItemRow({
          id: item.id || secureRandomToken(9),
          encrypted,
          item,
          createdAt: item.createdAt || nowStr,
          updatedAt: nowStr,
        });
      }));

      this.decryptedItemsCache.clear();
      for (const item of items) {
        const row = this.state.vault_items.find((candidate) => candidate.id === item.id);
        if (row) {
          this.decryptedItemsCache.set(row.id, {
            enc_metadata: row.enc_metadata,
            item,
          });
        }
      }

      const persisted = await this.saveToPersistentStorage();
      if (!persisted) {
        throw new Error('master-password-rotation-persist-failed');
      }

      this.logQuery('UPDATE user_secrets SET argon_hash = "[rotated argon2id verification hash]"; REKEY vault_items;', 'SUCCESS', items.length);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery('UPDATE user_secrets SET argon_hash = "[rekey rolled back: persistence failed]"; REKEY vault_items;', 'ERROR', 0);
      throw err;
    }
  }

  public getKdfParams(): Required<Argon2idOptions> {
    const raw = this.state.kdfParams || LEGACY_VAULT_ITEM_KDF_PARAMS;
    return enforceMinimumKdfFloor(raw);
  }

  /**
   * Returns a derived encryption key from the active vault salt using Argon2id.
   */
  public async deriveEncryptionKey(password: string, salt = this.getCurrentVaultEncryptionSalt()): Promise<Uint8Array> {
    const passwordBytes = new TextEncoder().encode(password);
    if (areByteArraysEqual(this.cachedPasswordBytes, passwordBytes) && this.cachedKeySalt === salt && this.cachedKeyBytes) {
      passwordBytes.fill(0);
      return new Uint8Array(this.cachedKeyBytes);
    }
    const key = await deriveVettedArgon2idKey(password, salt, this.getKdfParams());
    if (this.cachedPasswordBytes) {
      this.cachedPasswordBytes.fill(0);
    }
    this.cachedPasswordBytes = passwordBytes;
    this.cachedKeySalt = salt;
    this.cachedKeyBytes = new Uint8Array(key);
    return new Uint8Array(key);
  }

  /**
   * Retrieves and decrypts SQLite relational items on-the-fly.
   */
  public async getVaultItems(masterPasswordPlain: string): Promise<VaultItem[]> {
    const originalSalt = this.getCurrentVaultEncryptionSalt();
    const derivedKey = await this.deriveEncryptionKey(masterPasswordPlain, originalSalt);
    const shouldMigrateKdf = !this.state.kdfParams;
    const shouldMigrateStaticSalt = !this.state.encryption_salt;
    const migratedSalt = shouldMigrateStaticSalt ? createVaultEncryptionSalt() : this.state.encryption_salt!;
    const migrationKey = (shouldMigrateStaticSalt || shouldMigrateKdf)
      ? await deriveVettedArgon2idKey(masterPasswordPlain, migratedSalt, NEW_VAULT_ITEM_KDF_PARAMS)
      : derivedKey;

    return this.getVaultItemsWithDerivedKey(derivedKey, {
      migrationKey,
      migratedSalt,
      shouldMigrateKdf,
      shouldMigrateStaticSalt,
    });
  }

  public async getVaultItemsWithKey(derivedKey: Uint8Array): Promise<VaultItem[]> {
    return this.getVaultItemsWithDerivedKey(derivedKey);
  }

  private async getVaultItemsWithDerivedKey(
    derivedKey: Uint8Array,
    migration?: {
      migrationKey: Uint8Array;
      migratedSalt: string;
      shouldMigrateKdf: boolean;
      shouldMigrateStaticSalt: boolean;
    },
  ): Promise<VaultItem[]> {
    const queryStr = 'SELECT id, title, category, favorite, deleted, username_db, enc_metadata FROM vault_items;';

    this.checkCacheTtl();

    if (this.state.vault_items.length === 0) {
      this.logQuery(queryStr, 'SUCCESS', 0);
      return [];
    }

    try {
      const shouldMigrateKdf = migration?.shouldMigrateKdf ?? false;
      const shouldMigrateStaticSalt = migration?.shouldMigrateStaticSalt ?? false;
      const migratedSalt = migration?.migratedSalt ?? this.state.encryption_salt;
      const migrationKey = migration?.migrationKey ?? derivedKey;

      if (shouldMigrateStaticSalt || shouldMigrateKdf) {
        logSecurityEvent(
          securityEventCodes.securityLegacyCryptoWarning,
          'Legacy SQLite database encryption parameters detected. Migrating to secure Argon2id (64 MiB, 4 iterations).',
          'warning'
        );
      }

      const { results: decryptedResults, migratedLegacyRows } = await decryptVaultRows({
        rows: this.state.vault_items,
        cache: this.decryptedItemsCache,
        derivedKey,
        migration,
      });

      const list: VaultItem[] = decryptedResults.map(({ row, item }) => ({
        ...item,
        id: row.id,
        title: item.title || 'Imported Record',
        category: (row.category as VaultItem['category']) || 'login',
        favorite: row.favorite === 1,
        deleted: row.deleted === 1,
        deletedAt: row.deleted_at || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      if (migratedLegacyRows || shouldMigrateStaticSalt || shouldMigrateKdf) {
        if (shouldMigrateStaticSalt) {
          this.state.encryption_salt = migratedSalt;
        }
        if (shouldMigrateKdf) {
          this.state.kdfParams = NEW_VAULT_ITEM_KDF_PARAMS;
        }
        if (this.cachedPasswordBytes) {
          this.cachedPasswordBytes.fill(0);
        }
        this.cachedKeySalt = migratedSalt ?? null;
        this.cachedKeyBytes = migrationKey;
        await this.saveToPersistentStorage();
      }

      this.logQuery(queryStr, 'SUCCESS', list.length);
      return list;
    } catch {
      this.logQuery(queryStr, 'ERROR', 0);
      return [];
    }
  }

  /**
   * Saves or updates a specific Item row inside SQLite and OPFS with separate fresh 12-byte GCM IV.
   */
  public async saveVaultItem(item: VaultItem, masterPasswordPlain: string): Promise<VaultItem[]> {
    const derivedKey = await this.deriveEncryptionKey(masterPasswordPlain);
    return this.saveVaultItemWithKey(item, derivedKey);
  }

  public async saveVaultItemWithKey(item: VaultItem, derivedKey: Uint8Array): Promise<VaultItem[]> {
    this.checkCacheTtl();
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      this.ensureVaultEncryptionSalt();
      const index = this.state.vault_items.findIndex(x => x.id === item.id);
      const existingRow = index > -1 ? this.state.vault_items[index] : undefined;
      const itemId = item.id || secureRandomToken(9);

      // Security fix Y5: Prevent un-decrypted placeholder items from overwriting raw ciphertext
      const isPlaceholderItem = item.title === '[encrypted: aes-256-gcm]' && item.username === '[encrypted: aes-256-gcm]';
      if (isPlaceholderItem && existingRow && existingRow.enc_metadata) {
        logSecurityEvent(
          securityEventCodes.storageLegacyMigrationFailed,
          `Blocked saving un-decrypted placeholder item ${itemId} over existing raw ciphertext.`,
          'warning',
          { itemId },
        );
        return this.getVaultItemsWithKey(derivedKey);
      }

      const itemToSave = { ...item, id: itemId };
      const rawSensitive = JSON.stringify(itemToSave);
      const perItemKey = await derivePerItemKey(derivedKey, itemId);
      const encrypted = await webCryptoAesGcmEncrypt(rawSensitive, perItemKey, generateSafeIv());
      perItemKey.fill(0);

      const nowStr = new Date().toISOString().split('T')[0] ?? '';

      const row: SQLiteRow = buildVaultItemRow({
        id: itemId,
        encrypted,
        item,
        createdAt: item.createdAt || nowStr,
        updatedAt: nowStr,
      });

      let query = '';
      const safeId = sanitizeLogValue(row.id);
      const safeTitle = sanitizeLogValue(row.title);
      const safeCategory = sanitizeLogValue(row.category);
      if (index > -1) {
        this.state.vault_items[index] = row;
        query = `UPDATE vault_items SET title = "${safeTitle}", category = "${safeCategory}", enc_metadata = "[encrypted metadata payload]" WHERE id = "${safeId}";`;
      } else {
        this.state.vault_items.push(row);
        query = `INSERT INTO vault_items (id, title, category, favorite, username_db, password_db, enc_metadata) VALUES ("${safeId}", "${safeTitle}", "${safeCategory}", ${row.favorite}, "${row.username_db}", "${row.password_db}", "[encrypted metadata]");`;
      }

      // Cache the decrypted item so we don't have to decrypt it when returning getVaultItems
      this.decryptedItemsCache.set(row.id, {
        enc_metadata: row.enc_metadata,
        item: { ...item, id: row.id }
      });

      const persisted = await this.saveToPersistentStorage();
      if (!persisted) {
        throw new Error('vault-item-persist-failed');
      }

      this.logQuery(query, 'SUCCESS', 1);
      return this.getVaultItemsWithKey(derivedKey);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery('INSERT OR UPDATE vault_items rolled back because persistence failed;', 'ERROR', 0);
      if (err instanceof Error && err.message === 'vault-item-persist-failed') {
        throw err;
      }
      throw new Error('vault-item-save-failed');
    }
  }
  /**
   * Saves or updates multiple items in a single transaction (batch operation).
   * Reduces KDF derivations, disk writes, and decryption sweeps to O(1) database cycles.
   * Returns the saved items directly without re-decrypting the entire database.
   *
   * For very large imports (600+ items), processes items sequentially (not in parallel)
   * with frequent yielding to absolutely prevent main thread blocking.
   * Trade-off: Slower execution but zero UI freezing.
   */
  public async saveVaultItems(
    items: VaultItem[],
    masterPasswordPlain: string,
    onProgress?: (count: number) => void
  ): Promise<VaultItem[]> {
    const derivedKey = await this.deriveEncryptionKey(masterPasswordPlain);
    return this.saveVaultItemsWithKey(items, derivedKey, onProgress);
  }

  public async saveVaultItemsWithKey(
    items: VaultItem[],
    derivedKey: Uint8Array,
    onProgress?: (count: number) => void
  ): Promise<VaultItem[]> {
    this.checkCacheTtl();
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      this.ensureVaultEncryptionSalt();
      const nowStr = new Date().toISOString().split('T')[0] ?? '';

      const allRows: SQLiteRow[] = [];
      const failedItems: Array<{ id: string; error: string }> = []; // Security fix Y7
      const CHUNK_SIZE = 50;

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        type ChunkEncryptionResult =
          | { __failed: false; row: SQLiteRow }
          | { __failed: true; id: string; error: string };

        const chunkRows = await Promise.all(
          chunk.map(async (item): Promise<ChunkEncryptionResult> => {
            try {
              const itemId = item.id || secureRandomToken(9);
              const existingRow = this.state.vault_items.find(x => x.id === itemId);
              const isPlaceholderItem = item.title === '[encrypted: aes-256-gcm]' && item.username === '[encrypted: aes-256-gcm]';
              if (isPlaceholderItem && existingRow && existingRow.enc_metadata) {
                return { __failed: false, row: existingRow };
              }

              const rawSensitive = JSON.stringify(item);
              const encrypted = await webCryptoAesGcmEncrypt(rawSensitive, derivedKey, generateSafeIv());

              const row: SQLiteRow = buildVaultItemRow({
                id: itemId,
                encrypted,
                item,
                createdAt: item.createdAt || nowStr,
                updatedAt: nowStr,
              });

              this.decryptedItemsCache.set(row.id, {
                enc_metadata: row.enc_metadata,
                item: { ...item, id: row.id }
              });

              return { __failed: false, row };
            } catch (e) {
              // Security fix Y7: Track failed items instead of silently dropping them.
              console.error('Encryption error for item:', item.id, e);
              return { __failed: true, id: item.id, error: e instanceof Error ? e.message : String(e) };
            }
          })
        );

        for (const row of chunkRows) {
          if (!row.__failed) {
            allRows.push(row.row);
          } else {
            failedItems.push({ id: row.id, error: row.error });
          }
        }

        if (onProgress) {
          onProgress(allRows.length);
        }

        // Yield after each batch to keep the UI absolutely responsive and flush GCM thread pools
        await maybeDelay(20);
      }

      for (const row of allRows) {
        const index = this.state.vault_items.findIndex(x => x.id === row.id);
        if (index > -1) {
          this.state.vault_items[index] = row;
        } else {
          this.state.vault_items.push(row);
        }
      }

      const persisted = await this.saveToPersistentStorage();
      if (!persisted) {
        throw new Error('vault-items-persist-failed');
      }

      // Security fix Y7: Report actual saved count, not requested count.
      // Also log any failed items for auditing.
      if (failedItems.length > 0) {
        logSecurityEvent(
          securityEventCodes.storageLegacyMigrationFailed,
          `Bulk save completed with ${failedItems.length} encryption failures out of ${items.length} items.`,
          'warning',
          { failedCount: failedItems.length, failedIds: failedItems.map(f => f.id) },
        );
      }
      this.logQuery(`INSERT OR REPLACE INTO vault_items (${items.length} records);`, 'SUCCESS', allRows.length);

      return allRows.map((row) => {
        const cachedItem = this.decryptedItemsCache.get(row.id)?.item;
        return {
          ...(cachedItem ?? {}),
          id: row.id,
          title: cachedItem?.title || 'Imported Record',
          username: cachedItem?.username || row.username || '',
          password: cachedItem?.password || '',
          url: cachedItem?.url || '',
          notes: cachedItem?.notes,
          category: row.category as VaultItem['category'],
          favorite: row.favorite === 1,
          deleted: row.deleted === 1,
          deletedAt: row.deleted_at || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      });
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery(`INSERT OR REPLACE INTO vault_items (${items.length} records) rolled back because persistence failed;`, 'ERROR', 0);
      if (err instanceof Error && err.message === 'vault-items-persist-failed') {
        throw err;
      }
      throw new Error('vault-items-save-failed');
    }
  }
  /**
   * SQL Parser implementation simulating typical queries execution.
   * Useful for the Interactive SQL Command Terminal inside Settings/Audit!
   */
  public executeCustomSQL(sql: string, _masterPasswordPlain: string): VaultStorageQueryResult {
    const sanitized = sql.trim().replace(/;$/, '');
    const tokens = sanitized.split(/\s+/);

    if (tokens.length === 0) {
      return { columns: [], rows: [] };
    }

    const command = tokens[0]!.toUpperCase();

    if (command === 'SELECT') {
      // 1. SELECT * FROM user_secrets
      if (sanitized.toUpperCase().includes('USER_SECRETS')) {
        this.logQuery(sql, 'SUCCESS', this.state.user_secrets.length);
        return {
          columns: ['username', 'argon_hash'],
          rows: this.state.user_secrets.map(s => [s.username, s.argon_hash])
        };
      }

      // 2. SELECT * FROM vault_items
      if (sanitized.toUpperCase().includes('VAULT_ITEMS')) {
        let itemsToUse = this.state.vault_items;

        // Handle filter WHERE deleted = 0
        if (sanitized.toUpperCase().includes('WHERE DELETED = 0')) {
          itemsToUse = itemsToUse.filter(i => i.deleted === 0);
        } else if (sanitized.toUpperCase().includes('WHERE DELETED = 1')) {
          itemsToUse = itemsToUse.filter(i => i.deleted === 1);
        }

        const isAsterisk = tokens[1] === '*';

        this.logQuery(sql, 'SUCCESS', itemsToUse.length);

        if (isAsterisk) {
          return {
            columns: ['id', 'title', 'category', 'favorite', 'deleted', 'username_db', 'password_db', 'notes_db', 'enc_metadata'],
            rows: itemsToUse.map(i => [
              i.id,
              i.title,
              i.category,
              i.favorite,
              i.deleted,
              i.username_db,
              i.password_db,
              i.notes_db ? i.notes_db : 'NULL',
              i.enc_metadata.substring(0, 32) + '...'
            ])
          };
        } else {
          // Parse columns e.g. SELECT id, title, category FROM
          const selectPart = sanitized.toUpperCase().split('FROM')[0] ?? '';
          const cols = selectPart.replace('SELECT', '').split(',').map(c => c.trim().toLowerCase());

          return {
            columns: cols,
            rows: itemsToUse.map(i => {
              return cols.map(c => {
                if (c === 'id') return i.id;
                if (c === 'title') return i.title;
                if (c === 'category') return i.category;
                if (c === 'favorite') return i.favorite;
                if (c === 'deleted') return i.deleted;
                if (c === 'username_db' || c === 'username') return i.username_db;
                if (c === 'password_db' || c === 'password') return i.password_db;
                if (c === 'enc_metadata') return i.enc_metadata.substring(0, 32) + '...';
                return 'NULL';
              });
            })
          };
        }
      }

      return { columns: [], rows: [], error: "Only the 'user_secrets' and 'vault_items' tables are supported." };
    }

    if (command === 'UPDATE' || command === 'DELETE' || command === 'INSERT') {
      this.logQuery(sql, 'ERROR', 0);
      return { columns: [], rows: [], error: "Direct writes (INSERT/UPDATE/DELETE) are disabled in the SQLite terminal for security. Please use the main interface." };
    }

    this.logQuery(sql, 'ERROR', 0);
    return { columns: [], rows: [], error: `Unrecognized SQL command: "${command}". Only SELECT queries are supported.` };
  }

  /**
   * Resets entire SQLite database schemas.
   */
  public async resetAll(): Promise<void> {
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    this.state = createEmptyVaultDatabaseState();
    const nativeReset = await resetDesktopVaultDatabase();
    if (!nativeReset && getNativeVaultStorageScope() !== 'browser-fallback') {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery('DROP TABLE user_secrets; DROP TABLE vault_items; -- rolled back because native reset failed', 'ERROR', 0);
      throw new Error('vault-reset-native-persist-failed');
    }

    removeIndexedDbItemSync(LOCAL_FALLBACK_KEY);
    const persisted = await this.saveToPersistentStorage();
    if (!persisted) {
      this.logQuery('DROP TABLE user_secrets; DROP TABLE vault_items; -- reset persistence failed', 'ERROR', 0);
      throw new Error('vault-reset-persist-failed');
    }

    this.logQuery('DROP TABLE user_secrets; DROP TABLE vault_items;', 'SUCCESS', 1);
  }
  /**
   * Permanently purges an item
   */
  public async deletePermanently(id: string, passwordPlain: string): Promise<VaultItem[]> {
    const derivedKey = await this.deriveEncryptionKey(passwordPlain);
    return this.deletePermanentlyWithKey(id, derivedKey);
  }

  public async deletePermanentlyWithKey(id: string, derivedKey: Uint8Array): Promise<VaultItem[]> {
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      this.state.vault_items = this.state.vault_items.filter(row => row.id !== id);
      this.decryptedItemsCache.delete(id);
      const persisted = await this.saveToPersistentStorage();
      if (!persisted) {
        throw new Error('vault-item-delete-persist-failed');
      }
      this.logQuery(`DELETE FROM vault_items WHERE id = "${sanitizeLogValue(id)}";`, 'SUCCESS', 1);
      return this.getVaultItemsWithKey(derivedKey);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery(`DELETE FROM vault_items WHERE id = "${sanitizeLogValue(id)}" rolled back because persistence failed;`, 'ERROR', 0);
      if (err instanceof Error && err.message === 'vault-item-delete-persist-failed') {
        throw err;
      }
      throw new Error('vault-item-delete-failed');
    }
  }

  /**
   * Permanently purges multiple items in a batch transaction to prevent O(N) disk write iterations.
   */
  public async deletePermanentlyBatch(ids: string[], passwordPlain: string): Promise<VaultItem[]> {
    const derivedKey = await this.deriveEncryptionKey(passwordPlain);
    return this.deletePermanentlyBatchWithKey(ids, derivedKey);
  }

  public async deletePermanentlyBatchWithKey(ids: string[], derivedKey: Uint8Array): Promise<VaultItem[]> {
    if (ids.length === 0) return this.getVaultItemsWithKey(derivedKey);

    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      const idSet = new Set(ids);
      this.state.vault_items = this.state.vault_items.filter(row => !idSet.has(row.id));
      for (const id of ids) {
        this.decryptedItemsCache.delete(id);
      }
      const persisted = await this.saveToPersistentStorage();
      if (!persisted) {
        throw new Error('vault-items-delete-persist-failed');
      }
      this.logQuery(`DELETE FROM vault_items WHERE id IN (${ids.map(id => `"${sanitizeLogValue(id)}"`).join(', ')});`, 'SUCCESS', ids.length);
      return this.getVaultItemsWithKey(derivedKey);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery(`DELETE FROM vault_items WHERE id IN (${ids.map(id => `"${sanitizeLogValue(id)}"`).join(', ')}) rolled back because persistence failed;`, 'ERROR', 0);
      if (err instanceof Error && err.message === 'vault-items-delete-persist-failed') {
        throw err;
      }
      throw new Error('vault-items-delete-failed');
    }
  }

  /**
   * Seeds demo data.
   */
  public async reseedDemo(passwordPlain: string, demoItems: VaultItem[]): Promise<VaultItem[]> {
    const derivedKey = await this.deriveEncryptionKey(passwordPlain);
    return this.reseedDemoWithKey(derivedKey, demoItems);
  }

  public async reseedDemoWithKey(derivedKey: Uint8Array, demoItems: VaultItem[]): Promise<VaultItem[]> {
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      this.ensureVaultEncryptionSalt();
      this.decryptedItemsCache.clear();

      this.state.vault_items = await Promise.all(demoItems.map(async (item) => {
        const sensitivePayload = JSON.stringify(item);
        const encrypted = await webCryptoAesGcmEncrypt(sensitivePayload, derivedKey, generateSafeIv());
        const today = new Date().toISOString().split('T')[0] ?? '';

        return buildVaultItemRow({
          id: item.id,
          encrypted,
          item,
          createdAt: item.createdAt || today,
          updatedAt: today,
          exposeUsername: true,
        });
      }));

      const persisted = await this.saveToPersistentStorage();
      if (!persisted) {
        throw new Error('vault-reseed-persist-failed');
      }
      this.logQuery(`RESEED: INSERT ${demoItems.length} rows into 'vault_items'`, 'SUCCESS', demoItems.length);
      return this.getVaultItemsWithKey(derivedKey);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery(`RESEED: INSERT ${demoItems.length} rows into 'vault_items' rolled back because persistence failed`, 'ERROR', 0);
      if (err instanceof Error && err.message === 'vault-reseed-persist-failed') {
        throw err;
      }
      throw new Error('vault-reseed-failed');
    }
  }
}
export const sqliteOPFSInstance = new SQLiteOPFS();
