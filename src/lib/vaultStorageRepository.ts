/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';

export type SQLCommandStatus = 'SUCCESS' | 'ERROR';

export interface SQLCommandLog {
  id: string;
  timestamp: string;
  query: string;
  status: SQLCommandStatus;
  rowsAffected: number;
}

export interface VaultStorageQueryResult {
  columns: string[];
  rows: unknown[][];
  error?: string;
}

export interface VaultStorageRepository {
  hydrate(): Promise<void>;
  clearDerivedKeyCache(): void;
  subscribeLogs(callback: () => void): () => void;
  getQueryLogs(): SQLCommandLog[];
  logQuery(query: string, status: SQLCommandStatus, rowsAffected: number): void;
  verifyPassword(password: string): Promise<boolean>;
  setupMaster(password: string): Promise<void>;
  changeMasterPassword(oldPassword: string, newPassword: string): Promise<void>;
  deriveEncryptionKey(password: string, salt?: string): Promise<Uint8Array>;
  getVaultItems(masterPasswordPlain: string): Promise<VaultItem[]>;
  getVaultItemsWithKey?(vaultEncryptionKey: Uint8Array): Promise<VaultItem[]>;
  saveVaultItem(item: VaultItem, masterPasswordPlain: string): Promise<VaultItem[]>;
  saveVaultItemWithKey?(item: VaultItem, vaultEncryptionKey: Uint8Array): Promise<VaultItem[]>;
  saveVaultItems(
    items: VaultItem[],
    masterPasswordPlain: string,
    onProgress?: (count: number) => void
  ): Promise<VaultItem[]>;
  saveVaultItemsWithKey?(
    items: VaultItem[],
    vaultEncryptionKey: Uint8Array,
    onProgress?: (count: number) => void
  ): Promise<VaultItem[]>;
  executeCustomSQL(sql: string, masterPasswordPlain: string): VaultStorageQueryResult;
  resetAll(): Promise<void>;
  deletePermanently(id: string, passwordPlain: string): Promise<VaultItem[]>;
  deletePermanentlyWithKey?(id: string, vaultEncryptionKey: Uint8Array): Promise<VaultItem[]>;
  deletePermanentlyBatch(ids: string[], passwordPlain: string): Promise<VaultItem[]>;
  deletePermanentlyBatchWithKey?(ids: string[], vaultEncryptionKey: Uint8Array): Promise<VaultItem[]>;
  reseedDemo(passwordPlain: string, demoItems: VaultItem[]): Promise<VaultItem[]>;
  reseedDemoWithKey?(vaultEncryptionKey: Uint8Array, demoItems: VaultItem[]): Promise<VaultItem[]>;
  getArgonHash?(): string | Promise<string>;
  getCurrentVaultEncryptionSalt?(): string | Promise<string>;
  getKdfParams?(): any | Promise<any>;
  setupMasterWithHash?(argonHash: string, salt: string, kdfParams: any): Promise<void>;
  changeMasterPasswordWithHash?(
    newArgonHash: string,
    newSalt: string,
    kdfParams: any,
    oldVaultKey: Uint8Array,
    newVaultKey: Uint8Array,
  ): Promise<void>;
  close?(): Promise<void>;
}
