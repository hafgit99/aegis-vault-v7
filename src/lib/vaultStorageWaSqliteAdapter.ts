/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import type {
  SQLCommandLog,
  SQLCommandStatus,
  VaultStorageQueryResult,
  VaultStorageRepository,
} from './vaultStorageRepository';
import type { WaSqliteEngine } from './waSqliteEngine';

export const WA_SQLITE_READ_ONLY_ERROR = 'wa-sqlite-adapter-read-only';
export const WA_SQLITE_ENGINE_READ_ERROR = 'wa-sqlite-engine-read-failed';

export interface ReadOnlyWaSqliteVaultStorageAdapterOptions {
  engine?: WaSqliteEngine;
}

type WaSqliteVaultItemRow = {
  id: string;
  title?: string;
  category?: string;
  favorite?: unknown;
  deleted?: unknown;
  deleted_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

const VAULT_ITEM_METADATA_SELECT = `
SELECT id, title, category, favorite, deleted, deleted_at, created_at, updated_at
FROM vault_items;
`;

const VALID_CATEGORIES = new Set<VaultItem['category']>(['login', 'card', 'passkey', 'identity', 'secure_note']);

/**
 * Read-only migration mirror for the future wa-sqlite backend.
 *
 * This adapter intentionally does not persist data yet. It lets migration tests
 * exercise the same repository contract through a wa-sqlite-shaped boundary
 * while production storage remains on the vetted OPFS implementation.
 */
export class ReadOnlyWaSqliteVaultStorageAdapter implements VaultStorageRepository {
  private logs: SQLCommandLog[] = [];
  private onLogsChangedCallbacks: Array<() => void> = [];

  constructor(
    private readonly sourceRepository: VaultStorageRepository,
    private readonly options: ReadOnlyWaSqliteVaultStorageAdapterOptions = {},
  ) {}

  public async hydrate(): Promise<void> {
    await this.sourceRepository.hydrate();
    if (!this.options.engine) {
      return;
    }

    try {
      const health = await this.options.engine.initialize();
      this.logQuery(
        `WA_SQLITE_MIRROR initialize engine database=${health.databaseName};`,
        'SUCCESS',
        health.tableCount,
      );
    } catch (error) {
      this.logQuery(`WA_SQLITE_MIRROR initialize engine failed: ${this.errorMessage(error)};`, 'ERROR', 0);
      throw new Error(WA_SQLITE_ENGINE_READ_ERROR);
    }
  }

  public clearDerivedKeyCache(): void {
    this.sourceRepository.clearDerivedKeyCache();
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
      id: `wa-sqlite-${this.logs.length + 1}`,
      timestamp: new Date().toLocaleTimeString(),
      query: this.sanitizeQueryForLog(query),
      status,
      rowsAffected,
    });
    this.onLogsChangedCallbacks.forEach((callback) => callback());
  }

  public async verifyPassword(password: string): Promise<boolean> {
    const verified = await this.sourceRepository.verifyPassword(password);
    this.logQuery('WA_SQLITE_MIRROR VERIFY master credentials;', verified ? 'SUCCESS' : 'ERROR', verified ? 1 : 0);
    return verified;
  }

  public async setupMaster(): Promise<void> {
    this.rejectWrite('setupMaster');
  }

  public async changeMasterPassword(): Promise<void> {
    this.rejectWrite('changeMasterPassword');
  }

  public deriveEncryptionKey(password: string, salt?: string): Promise<Uint8Array> {
    return this.sourceRepository.deriveEncryptionKey(password, salt);
  }

  public async getVaultItems(masterPasswordPlain: string): Promise<VaultItem[]> {
    const sourceItems = await this.sourceRepository.getVaultItems(masterPasswordPlain);
    const sourceCopies = sourceItems.map((item) => ({ ...item }));

    if (!this.options.engine) {
      this.logQuery('WA_SQLITE_MIRROR SELECT vault_items FROM source;', 'SUCCESS', sourceCopies.length);
      return sourceCopies;
    }

    const engineRows = await this.readEngineVaultItemRows();
    if (engineRows.length === 0) {
      this.logQuery('WA_SQLITE_MIRROR SELECT vault_items FROM source fallback;', 'SUCCESS', sourceCopies.length);
      return sourceCopies;
    }

    const sourceById = new Map(sourceCopies.map((item) => [item.id, item]));
    const items = engineRows.map((row) => this.mergeEngineRowWithSourceItem(row, sourceById.get(row.id)));
    this.logQuery('WA_SQLITE_MIRROR SELECT vault_items FROM wa-sqlite engine;', 'SUCCESS', items.length);
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
      error: WA_SQLITE_READ_ONLY_ERROR,
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

  private rejectWrite(operation: string): never {
    this.logQuery(`WA_SQLITE_MIRROR BLOCKED ${operation};`, 'ERROR', 0);
    throw new Error(WA_SQLITE_READ_ONLY_ERROR);
  }

  private async readEngineVaultItemRows(): Promise<WaSqliteVaultItemRow[]> {
    try {
      const rows = await this.options.engine?.selectObjects(VAULT_ITEM_METADATA_SELECT);
      return (rows ?? [])
        .filter((row) => typeof row.id === 'string' && row.id.length > 0)
        .map((row) => ({
          id: String(row.id),
          title: this.optionalString(row.title),
          category: this.optionalString(row.category),
          favorite: row.favorite,
          deleted: row.deleted,
          deleted_at: row.deleted_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
        }));
    } catch (error) {
      this.logQuery(`WA_SQLITE_MIRROR SELECT vault_items failed: ${this.errorMessage(error)};`, 'ERROR', 0);
      throw new Error(WA_SQLITE_ENGINE_READ_ERROR);
    }
  }

  private mergeEngineRowWithSourceItem(row: WaSqliteVaultItemRow, sourceItem?: VaultItem): VaultItem {
    const base: VaultItem = sourceItem ?? {
      id: row.id,
      title: row.title || 'Imported Record',
      username: '',
      url: '',
      category: 'login',
      createdAt: this.optionalString(row.created_at) || '',
      updatedAt: this.optionalString(row.updated_at) || '',
    };

    return {
      ...base,
      id: row.id,
      title: row.title || base.title,
      category: this.normalizeCategory(row.category, base.category),
      favorite: this.sqliteBoolean(row.favorite, base.favorite),
      deleted: this.sqliteBoolean(row.deleted, base.deleted),
      deletedAt: this.optionalString(row.deleted_at) || base.deletedAt,
      createdAt: this.optionalString(row.created_at) || base.createdAt,
      updatedAt: this.optionalString(row.updated_at) || base.updatedAt,
    };
  }

  private normalizeCategory(category: string | undefined, fallback: VaultItem['category']): VaultItem['category'] {
    return category && VALID_CATEGORIES.has(category as VaultItem['category'])
      ? category as VaultItem['category']
      : fallback;
  }

  private sqliteBoolean(value: unknown, fallback?: boolean): boolean | undefined {
    if (value === null || value === undefined || value === '') {
      return fallback;
    }
    return Number(value) === 1;
  }

  private optionalString(value: unknown): string | undefined {
    if (value === null || value === undefined) {
      return undefined;
    }
    return String(value);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private sanitizeQueryForLog(query: string): string {
    return query.replace(/[\r\n\t]/g, ' ').replace(/<script/gi, '&lt;script').slice(0, 1000);
  }
}

export function createReadOnlyWaSqliteVaultStorageAdapter(
  sourceRepository: VaultStorageRepository,
  options: ReadOnlyWaSqliteVaultStorageAdapterOptions = {},
): VaultStorageRepository {
  return new ReadOnlyWaSqliteVaultStorageAdapter(sourceRepository, options);
}
