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

export const WA_SQLITE_READ_ONLY_ERROR = 'wa-sqlite-adapter-read-only';

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

  constructor(private readonly sourceRepository: VaultStorageRepository) {}

  public async hydrate(): Promise<void> {
    await this.sourceRepository.hydrate();
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
    const items = await this.sourceRepository.getVaultItems(masterPasswordPlain);
    this.logQuery('WA_SQLITE_MIRROR SELECT vault_items FROM source;', 'SUCCESS', items.length);
    return items.map((item) => ({ ...item }));
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

  private sanitizeQueryForLog(query: string): string {
    return query.replace(/[\r\n\t]/g, ' ').replace(/<script/gi, '&lt;script').slice(0, 1000);
  }
}

export function createReadOnlyWaSqliteVaultStorageAdapter(
  sourceRepository: VaultStorageRepository,
): VaultStorageRepository {
  return new ReadOnlyWaSqliteVaultStorageAdapter(sourceRepository);
}
