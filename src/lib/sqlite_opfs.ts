/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';
import { secureRandomBytes, secureRandomToken } from './random';
import {
  createEmptyVaultDatabaseState,
  normalizeVaultDatabaseState,
  parseVaultDatabaseState,
  type VaultDatabaseRow,
  type VersionedVaultDatabaseState,
} from './vaultDatabaseFormat';
import { createArgon2idHash, verifyArgon2idHash } from './argon2id';
import { deriveArgon2idKey as deriveVettedArgon2idKey } from './argon2id';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt, generateSafeIv, type WebCryptoAesGcmPayload } from './webcrypto';
import {
  getNativeVaultStorageScope,
  readDesktopVaultDatabase,
  resetDesktopVaultDatabase,
  writeDesktopVaultDatabase,
} from './desktopStorage';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import { registerOnCloseSession } from './vaultSession';
import { getIndexedDbItemSync, setIndexedDbItemSync, removeIndexedDbItemSync } from './indexedDbStorage';
import type {
  SQLCommandLog,
  SQLCommandStatus,
  VaultStorageQueryResult,
  VaultStorageRepository,
} from './vaultStorageRepository';

const isTestEnv = typeof window === 'undefined' ||
  (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) ||
  (typeof window !== 'undefined' && (window as any).__happyDOM__);

async function maybeDelay(ms: number): Promise<void> {
  if (isTestEnv) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * SQLite simulated schema and data manager storing DB blocks in private OPFS.
 */
export type SQLiteRow = VaultDatabaseRow;


const DB_FILENAME = 'aegis_sqlite.db';
const LOCAL_FALLBACK_KEY = 'aegis_sqlite_fallback';
const VAULT_ITEM_KDF = 'argon2-browser' as const;
const LEGACY_VAULT_ITEM_KDF = 'legacy-simulated-argon2id' as const;
const LEGACY_VAULT_ITEM_KDF_SALT = 'aegis_vault_v7_db_encryption_salt';
const LEGACY_VAULT_ITEM_KDF_PARAMS = {
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};
const NEW_VAULT_ITEM_KDF_PARAMS = {
  memoryKiB: 128 * 1024,
  iterations: 4,
  parallelism: 1,
  hashLength: 32,
};

class SQLiteOPFS implements VaultStorageRepository {
  private state: VersionedVaultDatabaseState = createEmptyVaultDatabaseState();

  private logs: SQLCommandLog[] = [];
  private onLogsChangedCallbacks: (() => void)[] = [];
  private hydratePromise: Promise<void>;

  // KDF derived key cache to avoid repeating heavy Argon2id calculations
  private cachedPasswordBytes: Uint8Array | null = null;
  private cachedKeySalt: string | null = null;
  private cachedKeyBytes: Uint8Array | null = null;

  // Decrypted items cache Map: row.id -> { enc_metadata: string, item: VaultItem }
  private decryptedItemsCache = new Map<string, { enc_metadata: string; item: VaultItem }>();

  constructor() {
    this.hydratePromise = this.loadFromPersistentStorage();
    registerOnCloseSession(() => {
      this.clearDerivedKeyCache();
    });
  }

  public async hydrate(): Promise<void> {
    await this.hydratePromise;
  }

  private areByteArraysEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i];
    }
    return result === 0;
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
      query: this.sanitizeQueryForLog(query),
      status,
      rowsAffected,
    });
    this.notifyLogsChanged();
  }

  private bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private createVaultEncryptionSalt(): string {
    return this.bytesToHex(secureRandomBytes(16));
  }

  private ensureVaultEncryptionSalt(): string {
    this.state.encryption_salt ??= this.createVaultEncryptionSalt();
    return this.state.encryption_salt;
  }

  private getCurrentVaultEncryptionSalt(): string {
    return this.state.encryption_salt || LEGACY_VAULT_ITEM_KDF_SALT;
  }

  private createDesktopManagedSetupMarker(): string {
    return JSON.stringify({
      schemaVersion: this.state.schemaVersion,
      appId: this.state.appId,
      desktopManaged: true,
      user_secrets: this.state.user_secrets.length > 0
        ? [{ username: 'owner', argon_hash: '[stored-in-desktop-app-data]' }]
        : [],
      vault_items: [],
    }, null, 2);
  }

  private writeLocalFallbackMirror(payloadStr: string, savedToDesktop: boolean): void {
    setIndexedDbItemSync(
      LOCAL_FALLBACK_KEY,
      savedToDesktop ? this.createDesktopManagedSetupMarker() : payloadStr,
    );
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

  private sanitizeLogValue(value: string): string {
    return value.replace(/[\r\n\t]/g, ' ').replace(/["\\<>]/g, '_').slice(0, 120);
  }

  private sanitizeQueryForLog(query: string): string {
    return query.replace(/[\r\n\t]/g, ' ').replace(/<script/gi, '&lt;script').slice(0, 1000);
  }

  /**
   * Loads SQLite file from OPFS (Origin Private File System) sandboxed directory.
   */
  private async loadFromPersistentStorage() {
    try {
      const desktopPayload = await readDesktopVaultDatabase();
      if (desktopPayload) {
        this.state = parseVaultDatabaseState(desktopPayload);
        setIndexedDbItemSync(LOCAL_FALLBACK_KEY, this.createDesktopManagedSetupMarker());
        this.logQuery(`sqlite3_open("${getNativeVaultStorageScope()}:///${DB_FILENAME}")`, 'SUCCESS', 1);
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
        const root = await navigator.storage.getDirectory();
        let fileHandle;
        try {
          fileHandle = await root.getFileHandle(DB_FILENAME);
        } catch (e) {
          // File does not exist yet. Initialize using localStorage backup or start fresh
          await this.migrateLegacyLocalStorage();
          await this.saveToPersistentStorage();
          return;
        }

        const file = await fileHandle.getFile();
        const content = await file.text();
        if (content) {
          this.state = parseVaultDatabaseState(content);
          this.logQuery(`sqlite3_open("opfs:///${DB_FILENAME}")`, 'SUCCESS', 1);
          await this.saveToPersistentStorage();
        }
      } else {
        // Fallback to standard sandbox-compliant simulated OPFS persistence
        await this.migrateLegacyLocalStorage();
      }
    } catch (err) {
      logSecurityEvent(
        securityEventCodes.storageDesktopReadFailed,
        'Persistent desktop storage could not be loaded; trying local fallback.',
        'warning',
        { error: err instanceof Error ? err.message : String(err) },
      );
      await this.migrateLegacyLocalStorage();
    }
  }

  /**
   * Saves raw DB state to private OPFS.
   */
  private async saveToPersistentStorage(): Promise<boolean> {
    try {
      const payloadStr = JSON.stringify(this.state);
      const savedToDesktop = await writeDesktopVaultDatabase(payloadStr);
      this.writeLocalFallbackMirror(payloadStr, savedToDesktop);

      if (isTestEnv || !savedToDesktop) {
        await this.writeToOPFSWithTimeout(payloadStr, 1000);
      } else {
        // Native app-data writes are already durable; OPFS is only a secondary mirror there.
        void this.writeToOPFSWithTimeout(payloadStr, 1000);
      }
      return true;
    } catch (err) {
      logSecurityEvent(
        securityEventCodes.storageDesktopWriteFailed,
        'Failed writing SQLite persistence block.',
        'critical',
        { error: err instanceof Error ? err.message : String(err) },
      );
      return false;
    }
  }

  /**
   * Writes the payload string to the sandboxed OPFS file standard in the background.
   * Uses Promise.race to enforce a timeout in case file locks are held by old sessions (hot-reloads).
   */
  private async writeToOPFSWithTimeout(payloadStr: string, timeoutMs: number): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
      return;
    }

    const opfsWritePromise = (async () => {
      const root = await navigator.storage.getDirectory();
      const fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });

      // Use createWritable if supported (standard), or fallback to alternative file APIs
      if ('createWritable' in fileHandle) {
        const writable = await (fileHandle as any).createWritable();
        await writable.write(payloadStr);
        await writable.close();
      } else {
        // Alternative file system writer standard for Safari / some Mobile browsers
        const accessHandle = await (fileHandle as any).createWritable ? await (fileHandle as any).createWritable() : null;
        if (accessHandle) {
          await accessHandle.write(payloadStr);
          await accessHandle.close();
        }
      }
    })();

    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => reject(new Error('OPFS write timed out (lock leak suspected)')), timeoutMs);
    });

    try {
      await Promise.race([opfsWritePromise, timeoutPromise]);
    } catch (err) {
      logSecurityEvent(
        securityEventCodes.storageDesktopWriteFailed,
        'OPFS mirror write failed or timed out.',
        'critical',
        { error: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  /**
   * Migrate legacy plaintext vault items into relational SQLite rows with GCM encryption.
   */
  private async migrateLegacyLocalStorage() {
    const fallback = getIndexedDbItemSync(LOCAL_FALLBACK_KEY);
    if (fallback) {
      try {
        const parsed = JSON.parse(fallback);
        if (!parsed.desktopManaged) {
          this.state = parseVaultDatabaseState(fallback);
          logSecurityEvent(securityEventCodes.storageLocalFallbackUsed, 'Loaded vault state from local fallback mirror.', 'warning');
          return;
        }
      } catch (e) {}
    }

    // Attempt to seed from standard legacy keys
    const isSetup = localStorage.getItem('aegis_is_setup') === 'true';
    const legacyPass = localStorage.getItem('aegis_master_password');
    const legacyItemsStr = localStorage.getItem('aegis_vault_items');

    if (isSetup && legacyPass && legacyItemsStr) {
      try {
        const passwordPlain = atob(legacyPass);
        const argonHash = await createArgon2idHash(passwordPlain, secureRandomToken(16));

        this.state.user_secrets = [{
          username: 'owner',
          argon_hash: argonHash,
        }];

        const items: VaultItem[] = JSON.parse(legacyItemsStr);
        this.state.encryption_salt = this.createVaultEncryptionSalt();
        const derivedKey = await this.deriveEncryptionKey(passwordPlain);

        this.state.vault_items = await Promise.all(items.map(async (item) => {
          const sensitivePayload = JSON.stringify(item);
          const encrypted = await webCryptoAesGcmEncrypt(sensitivePayload, derivedKey, generateSafeIv());

          return {
            id: item.id,
            title: item.title,
            category: item.category,
            favorite: item.favorite ? 1 : 0,
            deleted: item.deleted ? 1 : 0,
            deleted_at: item.deletedAt || null,
            created_at: item.createdAt,
            updated_at: item.updatedAt,
            username: item.username || '',
            username_db: '[encrypted: aes-256-gcm]',
            password_db: '[encrypted: aes-256-gcm]',
            notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',
            enc_metadata: JSON.stringify(encrypted),
            enc_kdf: VAULT_ITEM_KDF,
          };
        }));

        this.logQuery('CREATE TABLE vault_items (id TEXT PRIMARY KEY, title TEXT, category TEXT, favorite INTEGER, deleted INTEGER, username_db TEXT, password_db TEXT, enc_metadata TEXT);', 'SUCCESS', this.state.vault_items.length);
      } catch (e) {
        logSecurityEvent(
          securityEventCodes.storageLegacyMigrationFailed,
          'Legacy localStorage vault migration failed.',
          'critical',
          { error: e instanceof Error ? e.message : String(e) },
        );
      }
    }

    this.state = normalizeVaultDatabaseState(this.state);
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
    const expectedHash = this.state.user_secrets[0].argon_hash;
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
    const argonHash = await createArgon2idHash(password, secureRandomToken(16));
    this.state.encryption_salt = this.createVaultEncryptionSalt();
    this.state.kdfParams = NEW_VAULT_ITEM_KDF_PARAMS;
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
      const argonHash = await createArgon2idHash(newPassword, secureRandomToken(16));
      this.clearDerivedKeyCache();
      this.state.encryption_salt = this.createVaultEncryptionSalt();
      this.state.kdfParams = NEW_VAULT_ITEM_KDF_PARAMS;
      this.state.user_secrets = [{
        username: 'owner',
        argon_hash: argonHash,
      }];

      const derivedKey = await this.deriveEncryptionKey(newPassword);
      this.state.vault_items = await Promise.all(items.map(async (item) => {
        const encrypted = await webCryptoAesGcmEncrypt(JSON.stringify(item), derivedKey, generateSafeIv());
        const nowStr = new Date().toISOString().split('T')[0];

        return {
          id: item.id || secureRandomToken(9),
          title: item.title || 'Imported Record',
          category: item.category || 'login',
          favorite: item.favorite ? 1 : 0,
          deleted: item.deleted ? 1 : 0,
          deleted_at: item.deletedAt || null,
          created_at: item.createdAt || nowStr,
          updated_at: item.updatedAt || nowStr,
          username: item.username || '',
          username_db: '[encrypted: aes-256-gcm]',
          password_db: '[encrypted: aes-256-gcm]',
          notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',
          enc_metadata: JSON.stringify(encrypted),
          enc_kdf: VAULT_ITEM_KDF,
        };
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

  private getKdfParams() {
    return this.state.kdfParams || LEGACY_VAULT_ITEM_KDF_PARAMS;
  }

  /**
   * Returns a derived encryption key from the active vault salt using Argon2id.
   */
  public async deriveEncryptionKey(password: string, salt = this.getCurrentVaultEncryptionSalt()): Promise<Uint8Array> {
    const passwordBytes = new TextEncoder().encode(password);
    if (this.areByteArraysEqual(this.cachedPasswordBytes, passwordBytes) && this.cachedKeySalt === salt && this.cachedKeyBytes) {
      passwordBytes.fill(0);
      return this.cachedKeyBytes;
    }
    const key = await deriveVettedArgon2idKey(password, salt, this.getKdfParams());
    if (this.cachedPasswordBytes) {
      this.cachedPasswordBytes.fill(0);
    }
    this.cachedPasswordBytes = passwordBytes;
    this.cachedKeySalt = salt;
    this.cachedKeyBytes = key;
    return key;
  }

  /**
   * Retrieves and decrypts SQLite relational items on-the-fly.
   */
  public async getVaultItems(masterPasswordPlain: string): Promise<VaultItem[]> {
    const originalSalt = this.getCurrentVaultEncryptionSalt();
    const derivedKey = await this.deriveEncryptionKey(masterPasswordPlain, originalSalt);
    const shouldMigrateKdf = !this.state.kdfParams;
    const shouldMigrateStaticSalt = !this.state.encryption_salt;
    const migratedSalt = shouldMigrateStaticSalt ? this.createVaultEncryptionSalt() : this.state.encryption_salt;
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
          'security.legacyCryptoWarning' as any,
          'Legacy SQLite database encryption parameters detected. Migrating to secure Argon2id (128 MiB, 4 iterations).',
          'warning'
        );
      }

      let migratedLegacyRows = false;
      const decryptedResults: Array<{ row: SQLiteRow; item: VaultItem }> = [];

      // For very large datasets (600+ items), process decryption sequentially (not in parallel)
      // with frequent yielding to absolutely prevent main thread blocking.
      // Trade-off: Slower but zero UI freezing.
      const totalItems = this.state.vault_items.length;
      let decryptCount = 0;

      for (let i = 0; i < totalItems; i++) {
        const row = this.state.vault_items[i];

        try {
          const cachedEntry = this.decryptedItemsCache.get(row.id);
          const isLegacyRow = row.enc_kdf !== VAULT_ITEM_KDF;
          let decryptedJson: string;

          if (cachedEntry && cachedEntry.enc_metadata === row.enc_metadata && !shouldMigrateStaticSalt && !shouldMigrateKdf) {
            decryptedResults.push({ row, item: cachedEntry.item });
          } else {
            if (cachedEntry && cachedEntry.enc_metadata === row.enc_metadata) {
              decryptedJson = JSON.stringify(cachedEntry.item);
            } else {
              if (isLegacyRow) {
                logSecurityEvent(
                  'security.legacyCryptoWarning' as any,
                  'Legacy custom-crypto SQLite rows are no longer decrypted in this build. Re-export from an earlier migration build first.',
                  'critical'
                );
                throw new Error('legacy-custom-crypto-row-unsupported');
              }
              const encryptedPayload: WebCryptoAesGcmPayload = JSON.parse(row.enc_metadata);
              decryptedJson = await webCryptoAesGcmDecrypt(encryptedPayload, derivedKey);
            }

            const originalItem: VaultItem = JSON.parse(decryptedJson);

            if (isLegacyRow || shouldMigrateStaticSalt || shouldMigrateKdf) {
              const encrypted = await webCryptoAesGcmEncrypt(decryptedJson, migrationKey, generateSafeIv());
              row.enc_metadata = JSON.stringify(encrypted);
              row.enc_kdf = VAULT_ITEM_KDF;
              migratedLegacyRows = true;
            }

            this.decryptedItemsCache.set(row.id, {
              enc_metadata: row.enc_metadata,
              item: originalItem,
            });

            decryptedResults.push({ row, item: originalItem });
            decryptCount++;
          }
        } catch (e) {
          // Crypt key mismatch or corruption
          const fallbackItem: VaultItem = {
            id: row.id,
            title: row.title,
            username: row.username_db,
            url: '',
            category: row.category as any,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            favorite: row.favorite === 1,
            deleted: row.deleted === 1,
          };
          decryptedResults.push({ row, item: fallbackItem });
          decryptCount++;
        }

        // Yield only if we are doing actual decryption work to prevent UI freezing
        if (decryptCount > 0 && decryptCount % 10 === 0) {
          await maybeDelay(10);
          decryptCount = 0;
        }
      }

      const list: VaultItem[] = decryptedResults.map(({ row, item }) => ({
        ...item,
        id: row.id,
        title: row.title,
        category: row.category as any,
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
        this.cachedKeySalt = migratedSalt;
        this.cachedKeyBytes = migrationKey;
        await this.saveToPersistentStorage();
      }

      this.logQuery(queryStr, 'SUCCESS', list.length);
      return list;
    } catch (e) {
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
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      this.ensureVaultEncryptionSalt();
      const index = this.state.vault_items.findIndex(x => x.id === item.id);

      // Build fresh serialized payload
      const rawSensitive = JSON.stringify(item);
      // Uses separate secure 12-byte IV for this encryption action automatically inside aes256GcmEncrypt!
      const encrypted = await webCryptoAesGcmEncrypt(rawSensitive, derivedKey, generateSafeIv());

      const nowStr = new Date().toISOString().split('T')[0];
      const category = item.category || 'login';

      const row: SQLiteRow = {
        id: item.id || secureRandomToken(9),
        title: item.title || 'Imported Record',
        category: category,
        favorite: item.favorite ? 1 : 0,
        deleted: item.deleted ? 1 : 0,
        deleted_at: item.deletedAt || null,
        created_at: item.createdAt || nowStr,
        updated_at: nowStr,

        // Decrypted display properties
        username: item.username || '',

        // SQLite visible values (completely masked for security)
        username_db: '[encrypted: aes-256-gcm]',
        password_db: '[encrypted: aes-256-gcm]',
        notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',

        enc_metadata: JSON.stringify(encrypted),
        enc_kdf: VAULT_ITEM_KDF,
      };

      let query = '';
      const safeId = this.sanitizeLogValue(row.id);
      const safeTitle = this.sanitizeLogValue(row.title);
      const safeCategory = this.sanitizeLogValue(row.category);
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
    const previousState = this.cloneState();
    const previousDecryptedItemsCache = this.cloneDecryptedItemsCache();

    try {
      this.ensureVaultEncryptionSalt();
      const nowStr = new Date().toISOString().split('T')[0];

      const allRows: SQLiteRow[] = [];
      const CHUNK_SIZE = 50;

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const chunkRows = await Promise.all(
          chunk.map(async (item) => {
            try {
              const rawSensitive = JSON.stringify(item);
              const encrypted = await webCryptoAesGcmEncrypt(rawSensitive, derivedKey, generateSafeIv());
              const category = item.category || 'login';

              const row: SQLiteRow = {
                id: item.id || secureRandomToken(9),
                title: item.title || 'Imported Record',
                category: category,
                favorite: item.favorite ? 1 : 0,
                deleted: item.deleted ? 1 : 0,
                deleted_at: item.deletedAt || null,
                created_at: item.createdAt || nowStr,
                updated_at: nowStr,
                username: item.username || '',
                username_db: '[encrypted: aes-256-gcm]',
                password_db: '[encrypted: aes-256-gcm]',
                notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',
                enc_metadata: JSON.stringify(encrypted),
                enc_kdf: VAULT_ITEM_KDF,
              };

              this.decryptedItemsCache.set(row.id, {
                enc_metadata: row.enc_metadata,
                item: { ...item, id: row.id }
              });

              return row;
            } catch (e) {
              console.error('Encryption error for item:', item.id, e);
              return null;
            }
          })
        );

        for (const row of chunkRows) {
          if (row) {
            allRows.push(row);
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

      this.logQuery(`INSERT OR REPLACE INTO vault_items (${items.length} records);`, 'SUCCESS', items.length);

      return allRows.map((row) => {
        const cachedItem = this.decryptedItemsCache.get(row.id)?.item;
        return {
          ...(cachedItem ?? {}),
          id: row.id,
          title: row.title,
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
  public executeCustomSQL(sql: string, masterPasswordPlain: string): VaultStorageQueryResult {
    const sanitized = sql.trim().replace(/;$/, '');
    const tokens = sanitized.split(/\s+/);

    if (tokens.length === 0) {
      return { columns: [], rows: [] };
    }

    const command = tokens[0].toUpperCase();

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
          const selectPart = sanitized.toUpperCase().split('FROM')[0];
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
      this.logQuery(`DELETE FROM vault_items WHERE id = "${this.sanitizeLogValue(id)}";`, 'SUCCESS', 1);
      return this.getVaultItemsWithKey(derivedKey);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery(`DELETE FROM vault_items WHERE id = "${this.sanitizeLogValue(id)}" rolled back because persistence failed;`, 'ERROR', 0);
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
      this.logQuery(`DELETE FROM vault_items WHERE id IN (${ids.map(id => `"${this.sanitizeLogValue(id)}"`).join(', ')});`, 'SUCCESS', ids.length);
      return this.getVaultItemsWithKey(derivedKey);
    } catch (err) {
      this.restoreTransactionalState(previousState, previousDecryptedItemsCache);
      this.logQuery(`DELETE FROM vault_items WHERE id IN (${ids.map(id => `"${this.sanitizeLogValue(id)}"`).join(', ')}) rolled back because persistence failed;`, 'ERROR', 0);
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

        return {
          id: item.id,
          title: item.title,
          category: item.category,
          favorite: item.favorite ? 1 : 0,
          deleted: item.deleted ? 1 : 0,
          deleted_at: item.deletedAt || null,
          created_at: item.createdAt || new Date().toISOString().split('T')[0],
          updated_at: new Date().toISOString().split('T')[0],
          username: item.username || '',
          username_db: '[encrypted: aes-256-gcm]',
          password_db: '[encrypted: aes-256-gcm]',
          notes_db: item.notes ? '[encrypted: aes-256-gcm]' : '',
          enc_metadata: JSON.stringify(encrypted),
          enc_kdf: VAULT_ITEM_KDF,
        };
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
