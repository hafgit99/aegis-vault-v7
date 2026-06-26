/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import { createArgon2idHash, deriveArgon2idKey, verifyArgon2idHash } from './argon2id';
import { secureRandomToken } from './random';
import type {
  SQLCommandLog,
  SQLCommandStatus,
  VaultStorageQueryResult,
  VaultStorageRepository,
} from './vaultStorageRepository';
import { createWaSqliteEngine, type WaSqliteEngine } from './waSqliteEngine';

export const WA_SQLITE_WRITE_NOT_READY_ERROR = 'wa-sqlite-repository-write-not-ready';
export const WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR = 'wa-sqlite-invalid-master-password';

const VALID_CATEGORIES = new Set<VaultItem['category']>(['login', 'card', 'passkey', 'identity', 'secure_note']);
const DEFAULT_KEY_DERIVATION_SALT = 'aegis-wa-sqlite-v1-key-derivation';

export interface WaSqliteVaultStorageRepositoryOptions {
  engine?: WaSqliteEngine;
}

/**
 * First real wa-sqlite repository implementation.
 *
 * It owns the future backend contract but intentionally starts with the safest
 * subset: schema hydration, master setup/verification, metadata reads, and
 * fail-closed mutating vault item operations until encrypted row writes are
 * implemented and migration-tested end to end.
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
    const argonHash = await createArgon2idHash(password, secureRandomToken(16));
    await this.executeRequired('DELETE FROM user_secrets;');
    await this.executeRequired(
      'INSERT INTO user_secrets (username, argon_hash) VALUES '
      + `(${this.sqlString('owner')}, ${this.sqlString(argonHash)});`,
    );
    this.logQuery('INSERT INTO user_secrets (username, argon_hash) VALUES ("owner", "[argon2id verification hash]");', 'SUCCESS', 1);
  }

  public async changeMasterPassword(): Promise<void> {
    this.rejectWrite('changeMasterPassword');
  }

  public deriveEncryptionKey(password: string, salt = DEFAULT_KEY_DERIVATION_SALT): Promise<Uint8Array> {
    return deriveArgon2idKey(password, salt);
  }

  public async getVaultItems(masterPasswordPlain: string): Promise<VaultItem[]> {
    const verified = await this.verifyPassword(masterPasswordPlain);
    if (!verified) {
      this.logQuery('WA_SQLITE_REPOSITORY SELECT vault_items blocked: invalid master password;', 'ERROR', 0);
      throw new Error(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
    }

    const rows = await this.engine.selectObjects(`
SELECT id, title, category, favorite, deleted, deleted_at, created_at, updated_at
FROM vault_items;
`);
    const items = rows
      .filter((row) => typeof row.id === 'string' && row.id.length > 0)
      .map((row) => this.mapVaultItemRow(row));
    this.logQuery('SELECT id, title, category, favorite, deleted, deleted_at, created_at, updated_at FROM vault_items;', 'SUCCESS', items.length);
    return items;
  }

  public async saveVaultItem(): Promise<VaultItem[]> {
    this.rejectWrite('saveVaultItem');
  }

  public async saveVaultItems(): Promise<VaultItem[]> {
    this.rejectWrite('saveVaultItems');
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
    this.rejectWrite('resetAll');
  }

  public async deletePermanently(): Promise<VaultItem[]> {
    this.rejectWrite('deletePermanently');
  }

  public async deletePermanentlyBatch(): Promise<VaultItem[]> {
    this.rejectWrite('deletePermanentlyBatch');
  }

  public async reseedDemo(): Promise<VaultItem[]> {
    this.rejectWrite('reseedDemo');
  }

  private async executeRequired(sql: string): Promise<void> {
    const result = await this.engine.execute(sql);
    if (result.error) {
      throw new Error(result.error);
    }
  }

  private rejectWrite(operation: string): never {
    this.logQuery(`WA_SQLITE_REPOSITORY BLOCKED ${operation};`, 'ERROR', 0);
    throw new Error(WA_SQLITE_WRITE_NOT_READY_ERROR);
  }

  private mapVaultItemRow(row: Record<string, unknown>): VaultItem {
    const category = this.optionalString(row.category);
    return {
      id: this.optionalString(row.id) || '',
      title: this.optionalString(row.title) || 'Imported Record',
      username: '',
      url: '',
      category: category && VALID_CATEGORIES.has(category as VaultItem['category'])
        ? category as VaultItem['category']
        : 'login',
      favorite: Number(row.favorite ?? 0) === 1,
      deleted: Number(row.deleted ?? 0) === 1,
      deletedAt: this.optionalString(row.deleted_at),
      createdAt: this.optionalString(row.created_at) || '',
      updatedAt: this.optionalString(row.updated_at) || '',
    };
  }

  private optionalString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    return String(value);
  }

  private sqlString(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
  }

  private sanitizeQueryForLog(query: string): string {
    return query.replace(/[\r\n\t]/g, ' ').replace(/<script/gi, '&lt;script').slice(0, 1000);
  }
}

export function createWaSqliteVaultStorageRepository(
  options: WaSqliteVaultStorageRepositoryOptions = {},
): VaultStorageRepository {
  return new WaSqliteVaultStorageRepository(options);
}