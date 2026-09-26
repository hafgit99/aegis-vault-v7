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
  /**
   * K-4: why the vault could not be opened, if that is why. `null` means the
   * load succeeded or is still in flight. Optional because a repository may be
   * a pure in-memory implementation with nothing to fail.
   */
  getStartupFailure?(): Error | null;
  /**
   * K-4: true when startup failed because the vault file itself is present but
   * damaged, as opposed to any other load error. Callers must block unlock and
   * offer snapshot restore in that case rather than showing an empty vault.
   */
  isVaultFileUnreadable?(): boolean;
  clearDerivedKeyCache(): void;
  subscribeLogs(callback: () => void): () => void;
  getQueryLogs(): SQLCommandLog[];
  logQuery(query: string, status: SQLCommandStatus, rowsAffected: number): void;
  verifyPassword(password: string): Promise<boolean>;
  /**
   * K-3: `vaultEncryptionKey` lets the implementation sign the very first
   * persisted state. Omitting it leaves a master password on disk with no
   * integrity tag, which the next unlock correctly treats as tampering.
   */
  setupMaster(password: string, vaultEncryptionKey?: Uint8Array): Promise<void>;
  changeMasterPassword(oldPassword: string, newPassword: string): Promise<void>;
  deriveEncryptionKey(password: string, salt?: string): Promise<Uint8Array>;
  getVaultItems(masterPasswordPlain: string): Promise<VaultItem[]>;
  getVaultItemsWithKey(vaultEncryptionKey: Uint8Array): Promise<VaultItem[]>;
  saveVaultItem(item: VaultItem, masterPasswordPlain: string): Promise<VaultItem[]>;
  saveVaultItemWithKey?(item: VaultItem, vaultEncryptionKey: Uint8Array): Promise<VaultItem[]>;
  /**
   * Y-15: moves a single item in or out of the trash **without rewriting it**.
   *
   * `moveToTrash`/`restoreFromTrash` used to read the entire table, mutate one
   * item in memory, and write that item back. Two problems:
   *
   *   - decrypting the whole vault to change one flag is a large, slow,
   *     fail-prone operation for a one-field change;
   *   - the in-memory copy was the write source, so any field that changed
   *     between the read and the write was silently reverted.
   *
   * Implementations must update only the targeted row's `deleted`/`deletedAt`
   * fields and leave every other field of that row — and every other row — as
   * they are. Optional: `moveToTrash` falls back to the read-modify-write path
   * when an implementation does not provide it.
   */
  setItemTrashedWithKey?(
    id: string,
    trashed: boolean,
    vaultEncryptionKey: Uint8Array,
  ): Promise<VaultItem[]>;
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
  getKdfParams?(): unknown | Promise<unknown>;
  setupMasterWithHash?(
    argonHash: string,
    salt: string,
    kdfParams: unknown,
    vaultEncryptionKey?: Uint8Array,
  ): Promise<void>;
  changeMasterPasswordWithHash?(
    newArgonHash: string,
    newSalt: string,
    kdfParams: unknown,
    oldVaultKey: Uint8Array,
    newVaultKey: Uint8Array,
  ): Promise<void>;
  close?(): Promise<void>;
}
