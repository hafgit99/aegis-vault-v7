/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import { createArgon2idHash, deriveArgon2idKey, enforceMinimumKdfFloor, verifyArgon2idHash, type Argon2idOptions } from './argon2id';
import { secureRandomBytes, secureRandomToken } from './random';
import type {
  SQLCommandLog,
  SQLCommandStatus,
  VaultStorageQueryResult,
  VaultStorageRepository,
} from './vaultStorageRepository';
import { createWaSqliteEngine, type WaSqliteEngine } from './waSqliteEngine';
import { reWrapPasskeysInVaultItems } from './passkey';
import {
  derivePerItemKey,
  generateSafeIv,
  webCryptoAesGcmDecrypt,
  webCryptoAesGcmEncrypt,
  type WebCryptoAesGcmPayload,
} from './webcrypto';

export const WA_SQLITE_WRITE_NOT_READY_ERROR = 'wa-sqlite-repository-write-not-ready';
export const WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR = 'wa-sqlite-invalid-master-password';
export const WA_SQLITE_ROW_DECRYPT_ERROR = 'wa-sqlite-vault-row-decrypt-failed';

const VALID_CATEGORIES = new Set<VaultItem['category']>(['login', 'card', 'passkey', 'identity', 'secure_note']);
const VAULT_ITEM_KDF = 'argon2-browser' as const;
const VAULT_ENCRYPTION_SALT_KEY = 'vault_encryption_salt';
const VAULT_KDF_PARAMS_KEY = 'vault_kdf_params';
const ENCRYPTED_MARKER = '[encrypted: aes-256-gcm]';
// 32 MiB / 3 iterations is the cross-platform safe profile that the bundled
// argon2-browser WASM can always allocate in WebView2 (Windows), WebKit
// (macOS/iOS), WebKitGTK (Linux) and Android WebView. Higher memory profiles
// (64–128 MiB) crash with "memory access out of bounds" on constrained
// WebView2 builds. AES-256-GCM row encryption at rest still meets the OWASP
// password storage recommendation with this profile.
const DEFAULT_KDF_PARAMS: Required<Argon2idOptions> = {
  memoryKiB: 32 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

export interface WaSqliteVaultStorageRepositoryOptions {
  engine?: WaSqliteEngine;
}

type WaSqliteVaultItemRow = {
  id: string;
  title?: unknown;
  category?: unknown;
  favorite?: unknown;
  deleted?: unknown;
  deleted_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  username_db?: unknown;
  notes_db?: unknown;
  enc_metadata?: unknown;
  enc_kdf?: unknown;
};

/**
 * First real wa-sqlite repository implementation.
 *
 * It owns the future backend contract with authenticated master setup,
 * per-vault Argon2id key derivation metadata, AES-GCM encrypted item rows, and
 * transaction-guarded writes. Active backend selection still stays on OPFS until
 * migration parity is proven end to end.
 */
export class WaSqliteVaultStorageRepository implements VaultStorageRepository {
  private logs: SQLCommandLog[] = [];
  private onLogsChangedCallbacks: Array<() => void> = [];
  private readonly engine: WaSqliteEngine;

  constructor(options: WaSqliteVaultStorageRepositoryOptions = {}) {
    this.engine = options.engine ?? createWaSqliteEngine();
  }

  public async hydrate(): Promise<void> {
    const health = await this.engine.initialize();
    this.logQuery(`WA_SQLITE_REPOSITORY initialize database=${health.databaseName};`, 'SUCCESS', health.tableCount);
  }

  public clearDerivedKeyCache(): void {
    // wa-sqlite repository does not keep a plaintext-password-keyed cache.
  }

  public subscribeLogs(callback: () => void): () => void {
    this.onLogsChangedCallbacks.push(callback);
    return () => {
      this.onLogsChangedCallbacks = this.onLogsChangedCallbacks.filter((registered) => registered !== callback);
    };
  }

  public getQueryLogs(): SQLCommandLog[] {
    return [...this.logs].reverse().slice(0, 50);
  }

  public logQuery(query: string, status: SQLCommandStatus, rowsAffected: number): void {
    this.logs.push({
      id: `wa-sqlite-repository-${this.logs.length + 1}`,
      timestamp: new Date().toLocaleTimeString(),
      query: this.sanitizeQueryForLog(query),
      status,
      rowsAffected,
    });
    this.onLogsChangedCallbacks.forEach((callback) => callback());
  }

  public async verifyPassword(password: string): Promise<boolean> {
    await this.hydrate();
    const rows = await this.engine.selectObjects("SELECT argon_hash FROM user_secrets WHERE username = 'owner';");
    this.logQuery('SELECT argon_hash FROM user_secrets WHERE username = "owner";', rows.length > 0 ? 'SUCCESS' : 'ERROR', rows.length);
    const encodedHash = typeof rows[0]?.argon_hash === 'string' ? rows[0].argon_hash : null;

    if (!encodedHash) {
      return false;
    }

    const verified = await verifyArgon2idHash(password, encodedHash);
    this.logQuery('WA_SQLITE_REPOSITORY VERIFY master credentials;', verified ? 'SUCCESS' : 'ERROR', verified ? 1 : 0);
    return verified;
  }

  public async setupMaster(password: string): Promise<void> {
    await this.hydrate();
    const argonHash = await createArgon2idHash(password, this.createVaultEncryptionSalt());
    const salt = this.createVaultEncryptionSalt();

    await this.runTransaction(async () => {
      await this.executeRequired('DELETE FROM user_secrets;');
      await this.executeRequired('DELETE FROM vault_items;');
      await this.upsertStorageMetadata(VAULT_ENCRYPTION_SALT_KEY, salt);
      await this.upsertStorageMetadata(VAULT_KDF_PARAMS_KEY, JSON.stringify(DEFAULT_KDF_PARAMS));
      await this.executeRequired(
        'INSERT INTO user_secrets (username, argon_hash) VALUES '
        + `(${this.sqlString('owner')}, ${this.sqlString(argonHash)});`,
      );
    });

    this.logQuery('INSERT INTO user_secrets (username, argon_hash) VALUES ("owner", "[argon2id verification hash]");', 'SUCCESS', 1);
  }

  public async changeMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
    const verified = await this.verifyPassword(oldPassword);
    if (!verified) {
      this.logQuery('UPDATE user_secrets SET argon_hash = "[rekey blocked: invalid current password]";', 'ERROR', 0);
      throw new Error('current-master-password-invalid');
    }

    const oldSalt = await this.ensureVaultEncryptionSalt();
    const oldKey = await this.deriveEncryptionKey(oldPassword, oldSalt);
    const rows = await this.readVaultItemRows();
    const items: VaultItem[] = [];

    for (const row of rows) {
      items.push(await this.mapVaultItemRow(row, oldKey));
    }

    const newSalt = this.createVaultEncryptionSalt();
    const newKey = await deriveArgon2idKey(newPassword, newSalt, DEFAULT_KDF_PARAMS);
    const newArgonHash = await createArgon2idHash(newPassword, newSalt);
    const reWrappedItems = await reWrapPasskeysInVaultItems(items, oldKey, newKey);
    const rekeyedRows = await Promise.all(reWrappedItems.map((item) => this.createEncryptedRow(item, newKey)));

    await this.runTransaction(async () => {
      await this.executeRequired('DELETE FROM user_secrets;');
      await this.upsertStorageMetadata(VAULT_ENCRYPTION_SALT_KEY, newSalt);
      await this.upsertStorageMetadata(VAULT_KDF_PARAMS_KEY, JSON.stringify(DEFAULT_KDF_PARAMS));
      await this.executeRequired(
        'INSERT INTO user_secrets (username, argon_hash) VALUES '
        + `(${this.sqlString('owner')}, ${this.sqlString(newArgonHash)});`,
      );
      await this.executeRequired('DELETE FROM vault_items;');
      for (const row of rekeyedRows) {
        await this.executeRequired(this.createVaultItemUpsertSql(row));
      }
    });

    this.logQuery('UPDATE user_secrets SET argon_hash = "[rotated argon2id verification hash]"; REKEY vault_items;', 'SUCCESS', rekeyedRows.length);
  }

  public async deriveEncryptionKey(password: string, salt?: string): Promise<Uint8Array> {
    return deriveArgon2idKey(password, salt ?? await this.ensureVaultEncryptionSalt(), await this.getKdfParams());
  }

  public async getArgonHash(): Promise<string> {
    await this.hydrate();
    const rows = await this.engine.selectObjects("SELECT argon_hash FROM user_secrets WHERE username = 'owner';");
    return typeof rows[0]?.argon_hash === 'string' ? rows[0].argon_hash : '';
  }

  public async getCurrentVaultEncryptionSalt(): Promise<string> {
    return this.ensureVaultEncryptionSalt();
  }

  public async setupMasterWithHash(argonHash: string, salt: string, kdfParams: any): Promise<void> {
    await this.hydrate();
    await this.runTransaction(async () => {
      await this.executeRequired('DELETE FROM user_secrets;');
      await this.executeRequired('DELETE FROM vault_items;');
      await this.upsertStorageMetadata(VAULT_ENCRYPTION_SALT_KEY, salt);
      await this.upsertStorageMetadata(VAULT_KDF_PARAMS_KEY, JSON.stringify(kdfParams));
      await this.executeRequired(
        'INSERT INTO user_secrets (username, argon_hash) VALUES '
        + `(${this.sqlString('owner')}, ${this.sqlString(argonHash)});`,
      );
    });

    this.logQuery('INSERT INTO user_secrets (username, argon_hash) VALUES ("owner", "[argon2id verification hash]");', 'SUCCESS', 1);
  }

  public async changeMasterPasswordWithHash(
    newArgonHash: string,
    newSalt: string,
    kdfParams: any,
    oldVaultKey: Uint8Array,
    newVaultKey: Uint8Array,
  ): Promise<void> {
    const items = await this.getVaultItemsWithKey(oldVaultKey);
    const reWrappedItems = await reWrapPasskeysInVaultItems(items, oldVaultKey, newVaultKey);
    const rekeyedRows = await Promise.all(reWrappedItems.map((item) => this.createEncryptedRow(item, newVaultKey)));

    await this.runTransaction(async () => {
      await this.executeRequired('DELETE FROM user_secrets;');
      await this.upsertStorageMetadata(VAULT_ENCRYPTION_SALT_KEY, newSalt);
      await this.upsertStorageMetadata(VAULT_KDF_PARAMS_KEY, JSON.stringify(kdfParams));
      await this.executeRequired(
        'INSERT INTO user_secrets (username, argon_hash) VALUES '
        + `(${this.sqlString('owner')}, ${this.sqlString(newArgonHash)});`,
      );
      await this.executeRequired('DELETE FROM vault_items;');
      for (const row of rekeyedRows) {
        await this.executeRequired(this.createVaultItemUpsertSql(row));
      }
    });

    this.logQuery('UPDATE user_secrets SET argon_hash = "[rotated argon2id verification hash]"; REKEY vault_items;', 'SUCCESS', rekeyedRows.length);
  }

  public async getVaultItems(masterPasswordPlain: string): Promise<VaultItem[]> {
    const verified = await this.verifyPassword(masterPasswordPlain);
    if (!verified) {
      this.logQuery('WA_SQLITE_REPOSITORY SELECT vault_items blocked: invalid master password;', 'ERROR', 0);
      throw new Error(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
    }

    const key = await this.deriveEncryptionKey(masterPasswordPlain);
    return this.getVaultItemsWithKey(key);
  }

  public async getVaultItemsWithKey(key: Uint8Array): Promise<VaultItem[]> {
    const rows = await this.readVaultItemRows();
    const items: VaultItem[] = [];

    for (const row of rows) {
      items.push(await this.mapVaultItemRow(row, key));
    }

    this.logQuery('SELECT id, title, category, favorite, deleted, deleted_at, created_at, updated_at, username_db, notes_db, enc_metadata, enc_kdf FROM vault_items;', 'SUCCESS', items.length);
    return items;
  }

  public async saveVaultItem(item: VaultItem, masterPasswordPlain: string): Promise<VaultItem[]> {
    const verified = await this.verifyPassword(masterPasswordPlain);
    if (!verified) {
      this.logQuery('WA_SQLITE_REPOSITORY UPSERT vault_items blocked: invalid master password;', 'ERROR', 0);
      throw new Error(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
    }

    const key = await this.deriveEncryptionKey(masterPasswordPlain);
    return this.saveVaultItemWithKey(item, key);
  }

  public async saveVaultItemWithKey(item: VaultItem, key: Uint8Array): Promise<VaultItem[]> {
    const row = await this.createEncryptedRow(item, key);

    await this.runTransaction(async () => {
      await this.executeRequired(this.createVaultItemUpsertSql(row));
    });

    this.logQuery(`INSERT OR REPLACE INTO vault_items (id, title, category, enc_metadata) VALUES (${this.sqlStringForLog(this.optionalString(row.id) || '')}, ${this.sqlStringForLog(this.optionalString(row.title) || 'Imported Record')}, ${this.sqlStringForLog(this.optionalString(row.category) || 'login')}, "[encrypted metadata]");`, 'SUCCESS', 1);
    return this.getVaultItemsWithKey(key);
  }

  public async saveVaultItems(
    items: VaultItem[],
    masterPasswordPlain: string,
    onProgress?: (count: number) => void,
  ): Promise<VaultItem[]> {
    const verified = await this.verifyPassword(masterPasswordPlain);
    if (!verified) {
      this.logQuery('WA_SQLITE_REPOSITORY UPSERT vault_items batch blocked: invalid master password;', 'ERROR', 0);
      throw new Error(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
    }

    const key = await this.deriveEncryptionKey(masterPasswordPlain);
    return this.saveVaultItemsWithKey(items, key, onProgress);
  }

  public async saveVaultItemsWithKey(
    items: VaultItem[],
    key: Uint8Array,
    onProgress?: (count: number) => void,
  ): Promise<VaultItem[]> {
    const rows: WaSqliteVaultItemRow[] = [];

    for (const item of items) {
      rows.push(await this.createEncryptedRow(item, key));
    }

    await this.runTransaction(async () => {
      for (const [index, row] of rows.entries()) {
        await this.executeRequired(this.createVaultItemUpsertSql(row));
        onProgress?.(index + 1);
      }
    });

    this.logQuery(`INSERT OR REPLACE INTO vault_items (${rows.length} records);`, 'SUCCESS', rows.length);
    return rows.map((row) => this.projectRowWithPlainItem(row, items.find((item) => item.id === row.id)));
  }

  public executeCustomSQL(sql: string): VaultStorageQueryResult {
    this.logQuery(sql, 'ERROR', 0);
    return {
      columns: [],
      rows: [],
      error: WA_SQLITE_WRITE_NOT_READY_ERROR,
    };
  }

  public async resetAll(): Promise<void> {
    await this.hydrate();
    await this.runTransaction(async () => {
      await this.executeRequired('DELETE FROM vault_items;');
      await this.executeRequired('DELETE FROM user_secrets;');
      await this.executeRequired('DELETE FROM storage_metadata;');
    });
    this.logQuery('DELETE FROM vault_items; DELETE FROM user_secrets; DELETE FROM storage_metadata;', 'SUCCESS', 1);
  }

  public async deletePermanently(id: string, passwordPlain: string): Promise<VaultItem[]> {
    return this.deletePermanentlyBatch([id], passwordPlain);
  }

  public async deletePermanentlyWithKey(id: string, vaultEncryptionKey: Uint8Array): Promise<VaultItem[]> {
    return this.deletePermanentlyBatchWithKey([id], vaultEncryptionKey);
  }

  public async deletePermanentlyBatch(ids: string[], passwordPlain: string): Promise<VaultItem[]> {
    if (ids.length === 0) {
      return this.getVaultItems(passwordPlain);
    }

    const verified = await this.verifyPassword(passwordPlain);
    if (!verified) {
      this.logQuery('WA_SQLITE_REPOSITORY DELETE vault_items blocked: invalid master password;', 'ERROR', 0);
      throw new Error(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
    }

    const key = await this.deriveEncryptionKey(passwordPlain);
    return this.deletePermanentlyBatchWithKey(ids, key);
  }

  public async deletePermanentlyBatchWithKey(ids: string[], key: Uint8Array): Promise<VaultItem[]> {
    if (ids.length === 0) {
      return this.getVaultItemsWithKey(key);
    }

    await this.runTransaction(async () => {
      await this.executeRequired(`DELETE FROM vault_items WHERE id IN (${ids.map((id) => this.sqlString(id)).join(', ')});`);
    });

    this.logQuery(`DELETE FROM vault_items WHERE id IN (${ids.map((id) => this.sqlStringForLog(id)).join(', ')});`, 'SUCCESS', ids.length);
    return this.getVaultItemsWithKey(key);
  }

  public async reseedDemo(passwordPlain: string, demoItems: VaultItem[]): Promise<VaultItem[]> {
    const verified = await this.verifyPassword(passwordPlain);
    if (!verified) {
      this.logQuery('WA_SQLITE_REPOSITORY RESEED blocked: invalid master password;', 'ERROR', 0);
      throw new Error(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
    }

    const key = await this.deriveEncryptionKey(passwordPlain);
    return this.reseedDemoWithKey(key, demoItems);
  }

  public async reseedDemoWithKey(key: Uint8Array, demoItems: VaultItem[]): Promise<VaultItem[]> {
    const rows = await Promise.all(demoItems.map((item) => this.createEncryptedRow(item, key)));

    await this.runTransaction(async () => {
      await this.executeRequired('DELETE FROM vault_items;');
      for (const row of rows) {
        await this.executeRequired(this.createVaultItemUpsertSql(row));
      }
    });

    this.logQuery(`RESEED: INSERT ${rows.length} rows into vault_items;`, 'SUCCESS', rows.length);
    return this.getVaultItemsWithKey(key);
  }

  private async executeRequired(sql: string): Promise<void> {
    const result = await this.engine.execute(sql);
    if (result.error) {
      throw new Error(result.error);
    }
  }

  private async runTransaction(operation: () => Promise<void>): Promise<void> {
    await this.executeRequired('BEGIN IMMEDIATE;');
    try {
      await operation();
      await this.executeRequired('COMMIT;');
    } catch (error) {
      await this.engine.execute('ROLLBACK;');
      this.logQuery(`WA_SQLITE_REPOSITORY transaction rolled back: ${this.errorMessage(error)};`, 'ERROR', 0);
      throw error;
    }
  }

  private rejectWrite(operation: string): never {
    this.logQuery(`WA_SQLITE_REPOSITORY BLOCKED ${operation};`, 'ERROR', 0);
    throw new Error(WA_SQLITE_WRITE_NOT_READY_ERROR);
  }

  private async readVaultItemRows(): Promise<WaSqliteVaultItemRow[]> {
    const rows = await this.engine.selectObjects(`
SELECT id, title, category, favorite, deleted, deleted_at, created_at, updated_at, username_db, notes_db, enc_metadata, enc_kdf
FROM vault_items;
`);
    return rows.filter((candidate) => typeof candidate.id === 'string' && candidate.id.length > 0) as WaSqliteVaultItemRow[];
  }

  private async mapVaultItemRow(row: WaSqliteVaultItemRow, key: Uint8Array): Promise<VaultItem> {
    const metadata = this.optionalString(row.enc_metadata);
    const category = this.normalizeCategory(this.optionalString(row.category), 'login');
    const fallback: VaultItem = {
      id: this.optionalString(row.id) || '',
      title: 'Imported Record',
      username: '',
      url: '',
      category,
      favorite: Number(row.favorite ?? 0) === 1,
      deleted: Number(row.deleted ?? 0) === 1,
      deletedAt: this.optionalString(row.deleted_at),
      createdAt: this.optionalString(row.created_at) || '',
      updatedAt: this.optionalString(row.updated_at) || '',
    };

    if (!metadata || metadata === '[dry-run metadata mirror]') {
      return fallback;
    }

    try {
      const perItemKey = await derivePerItemKey(key, fallback.id);
      let decryptedJson: string;
      try {
        decryptedJson = await webCryptoAesGcmDecrypt(JSON.parse(metadata) as WebCryptoAesGcmPayload, perItemKey);
      } catch {
        decryptedJson = await webCryptoAesGcmDecrypt(JSON.parse(metadata) as WebCryptoAesGcmPayload, key);
      } finally {
        perItemKey.fill(0);
      }

      const item = JSON.parse(decryptedJson) as VaultItem;
      return {
        ...item,
        id: fallback.id,
        title: item.title || fallback.title,
        category: item.category || category,
        favorite: item.favorite !== undefined ? item.favorite : fallback.favorite,
        deleted: item.deleted !== undefined ? item.deleted : fallback.deleted,
        deletedAt: item.deletedAt !== undefined ? item.deletedAt : fallback.deletedAt,
        createdAt: item.createdAt || fallback.createdAt,
        updatedAt: item.updatedAt || fallback.updatedAt,
      };
    } catch (error) {
      this.logQuery(`WA_SQLITE_REPOSITORY decrypt vault_items row failed id=${this.sanitizeLogValue(fallback.id)}: ${this.errorMessage(error)};`, 'ERROR', 0);
      throw new Error(WA_SQLITE_ROW_DECRYPT_ERROR);
    }
  }

  private async createEncryptedRow(item: VaultItem, key: Uint8Array): Promise<WaSqliteVaultItemRow> {
    const nowStr = new Date().toISOString().split('T')[0];
    const id = item.id || secureRandomToken(9);
    const createdAt = item.createdAt || nowStr;
    const updatedAt = item.updatedAt || nowStr;
    const category = this.normalizeCategory(item.category, 'login');
    const itemToEncrypt: VaultItem = {
      ...item,
      id,
      title: item.title || 'Imported Record',
      username: item.username || '',
      url: item.url || '',
      category,
      favorite: item.favorite ?? false,
      deleted: item.deleted ?? false,
      deletedAt: item.deletedAt,
      createdAt,
      updatedAt,
    };
    const perItemKey = await derivePerItemKey(key, id);
    const encrypted = await webCryptoAesGcmEncrypt(JSON.stringify(itemToEncrypt), perItemKey, generateSafeIv());
    perItemKey.fill(0);

    return {
      id,
      title: ENCRYPTED_MARKER,
      category,
      favorite: item.favorite ? 1 : 0,
      deleted: item.deleted ? 1 : 0,
      deleted_at: item.deletedAt || null,
      created_at: createdAt,
      updated_at: updatedAt,
      username_db: ENCRYPTED_MARKER,
      notes_db: item.notes ? ENCRYPTED_MARKER : '',
      enc_metadata: JSON.stringify(encrypted),
      enc_kdf: VAULT_ITEM_KDF,
    };
  }

  private projectRowWithPlainItem(row: WaSqliteVaultItemRow, item?: VaultItem): VaultItem {
    return {
      ...((item ?? {}) as VaultItem),
      id: this.optionalString(row.id) || '',
      title: item?.title || 'Imported Record',
      username: item?.username || '',
      url: item?.url || '',
      category: this.normalizeCategory(this.optionalString(row.category), item?.category || 'login'),
      favorite: Number(row.favorite ?? 0) === 1,
      deleted: Number(row.deleted ?? 0) === 1,
      deletedAt: this.optionalString(row.deleted_at),
      createdAt: this.optionalString(row.created_at) || item?.createdAt || '',
      updatedAt: this.optionalString(row.updated_at) || item?.updatedAt || '',
    };
  }

  private createVaultItemUpsertSql(row: WaSqliteVaultItemRow): string {
    return 'INSERT INTO vault_items ('
      + 'id, title, category, favorite, deleted, deleted_at, created_at, updated_at, username_db, password_db, notes_db, enc_metadata, enc_kdf'
      + ') VALUES ('
      + [
        this.sqlString(this.optionalString(row.id) || ''),
        this.sqlString(this.optionalString(row.title) || 'Imported Record'),
        this.sqlString(this.optionalString(row.category) || 'login'),
        Number(row.favorite ?? 0),
        Number(row.deleted ?? 0),
        this.sqlNullableString(row.deleted_at),
        this.sqlString(this.optionalString(row.created_at) || ''),
        this.sqlString(this.optionalString(row.updated_at) || ''),
        this.sqlString(ENCRYPTED_MARKER),
        this.sqlString(ENCRYPTED_MARKER),
        this.sqlString(this.optionalString(row.notes_db) || ''),
        this.sqlString(this.optionalString(row.enc_metadata) || ''),
        this.sqlString(this.optionalString(row.enc_kdf) || VAULT_ITEM_KDF),
      ].join(', ')
      + ') ON CONFLICT(id) DO UPDATE SET '
      + 'title = excluded.title, '
      + 'category = excluded.category, '
      + 'favorite = excluded.favorite, '
      + 'deleted = excluded.deleted, '
      + 'deleted_at = excluded.deleted_at, '
      + 'created_at = excluded.created_at, '
      + 'updated_at = excluded.updated_at, '
      + 'username_db = excluded.username_db, '
      + 'password_db = excluded.password_db, '
      + 'notes_db = excluded.notes_db, '
      + 'enc_metadata = excluded.enc_metadata, '
      + 'enc_kdf = excluded.enc_kdf;';
  }

  private async ensureVaultEncryptionSalt(): Promise<string> {
    const existingSalt = await this.getStorageMetadata(VAULT_ENCRYPTION_SALT_KEY);
    if (existingSalt) {
      return existingSalt;
    }

    const salt = this.createVaultEncryptionSalt();
    await this.upsertStorageMetadata(VAULT_ENCRYPTION_SALT_KEY, salt);
    await this.upsertStorageMetadata(VAULT_KDF_PARAMS_KEY, JSON.stringify(DEFAULT_KDF_PARAMS));
    return salt;
  }

  public async getKdfParams(): Promise<Required<Argon2idOptions>> {
    const rawParams = await this.getStorageMetadata(VAULT_KDF_PARAMS_KEY);
    if (!rawParams) {
      return enforceMinimumKdfFloor(DEFAULT_KDF_PARAMS);
    }

    try {
      const parsed = JSON.parse(rawParams);
      return enforceMinimumKdfFloor({
        ...DEFAULT_KDF_PARAMS,
        ...parsed,
      });
    } catch {
      return enforceMinimumKdfFloor(DEFAULT_KDF_PARAMS);
    }
  }

  private async getStorageMetadata(key: string): Promise<string | null> {
    await this.hydrate();
    const rows = await this.engine.selectObjects(`SELECT value FROM storage_metadata WHERE key = ${this.sqlString(key)};`);
    const value = rows[0]?.value;
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  private async upsertStorageMetadata(key: string, value: string): Promise<void> {
    await this.executeRequired(
      'INSERT INTO storage_metadata (key, value) VALUES '
      + `(${this.sqlString(key)}, ${this.sqlString(value)}) `
      + 'ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
    );
  }

  private createVaultEncryptionSalt(): string {
    return Array.from(secureRandomBytes(16)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private normalizeCategory(category: string | undefined, fallback: VaultItem['category']): VaultItem['category'] {
    return category && VALID_CATEGORIES.has(category as VaultItem['category'])
      ? category as VaultItem['category']
      : fallback;
  }

  private optionalString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    return String(value);
  }

  private sqlNullableString(value: unknown): string {
    const normalizedValue = this.optionalString(value);
    return normalizedValue ? this.sqlString(normalizedValue) : 'NULL';
  }

  private sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private sqlStringForLog(value: string): string {
    return `"${this.sanitizeLogValue(value)}"`;
  }

  private sanitizeLogValue(value: string): string {
    return value.replace(/[\r\n\t]/g, ' ').replace(/["\\<>]/g, '_').slice(0, 120);
  }

  private sanitizeQueryForLog(query: string): string {
    return query.replace(/[\r\n\t]/g, ' ').replace(/<script/gi, '&lt;script').slice(0, 1000);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? this.sanitizeLogValue(error.message) : this.sanitizeLogValue(String(error));
  }

  public async close(): Promise<void> {
    await this.engine.close();
  }
}

export function createWaSqliteVaultStorageRepository(
  options: WaSqliteVaultStorageRepositoryOptions = {},
): VaultStorageRepository {
  return new WaSqliteVaultStorageRepository(options);
}
