/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import type { VaultStorageRepository } from './vaultStorageRepository';
import {
  createReadOnlyWaSqliteVaultStorageAdapter,
  WA_SQLITE_READ_ONLY_ERROR,
} from './vaultStorageWaSqliteAdapter';

function createRepositoryStub(items: VaultItem[] = []): VaultStorageRepository {
  return {
    hydrate: vi.fn(async () => undefined),
    clearDerivedKeyCache: vi.fn(),
    subscribeLogs: vi.fn(() => vi.fn()),
    getQueryLogs: vi.fn(() => []),
    logQuery: vi.fn(),
    verifyPassword: vi.fn(async (password: string) => password === 'valid-master'),
    setupMaster: vi.fn(async () => undefined),
    changeMasterPassword: vi.fn(async () => undefined),
    deriveEncryptionKey: vi.fn(async () => new Uint8Array(32)),
    getVaultItems: vi.fn(async () => items),
    saveVaultItem: vi.fn(async () => []),
    saveVaultItems: vi.fn(async () => []),
    executeCustomSQL: vi.fn(() => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => undefined),
    deletePermanently: vi.fn(async () => []),
    deletePermanentlyBatch: vi.fn(async () => []),
    reseedDemo: vi.fn(async () => []),
  };
}

describe('read-only wa-sqlite vault storage adapter', () => {
  it('mirrors source reads without exposing mutable item references', async () => {
    const item: VaultItem = {
      id: 'item-1',
      title: 'Example',
      username: 'owner',
      url: 'https://example.com',
      category: 'login',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const sourceRepository = createRepositoryStub([item]);
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(sourceRepository);

    expect(await adapter.verifyPassword('valid-master')).toBe(true);
    const mirroredItems = await adapter.getVaultItems('valid-master');

    expect(sourceRepository.verifyPassword).toHaveBeenCalledWith('valid-master');
    expect(sourceRepository.getVaultItems).toHaveBeenCalledWith('valid-master');
    expect(mirroredItems).toEqual([item]);
    expect(mirroredItems[0]).not.toBe(item);
    expect(adapter.getQueryLogs()).toHaveLength(2);
  });

  it('blocks writes instead of forwarding them to the source repository', async () => {
    const sourceRepository = createRepositoryStub();
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(sourceRepository);

    await expect(adapter.saveVaultItem({ id: 'item-1', title: 'Blocked' } as VaultItem, 'valid-master')).rejects.toThrow(
      WA_SQLITE_READ_ONLY_ERROR,
    );
    await expect(adapter.resetAll()).rejects.toThrow(WA_SQLITE_READ_ONLY_ERROR);

    expect(sourceRepository.saveVaultItem).not.toHaveBeenCalled();
    expect(sourceRepository.resetAll).not.toHaveBeenCalled();
    expect(adapter.getQueryLogs().map((entry) => entry.status)).toEqual(['ERROR', 'ERROR']);
  });

  it('returns a read-only error for custom SQL and sanitizes log text', () => {
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(createRepositoryStub());

    expect(adapter.executeCustomSQL('SELECT * FROM vault_items;\n<script>alert(1)</script>', 'valid-master')).toEqual({
      columns: [],
      rows: [],
      error: WA_SQLITE_READ_ONLY_ERROR,
    });

    expect(adapter.getQueryLogs()[0].query).toBe('SELECT * FROM vault_items; &lt;script>alert(1)</script>');
  });
  it('delegates safe operations and rejects every repository write surface', async () => {
    const sourceRepository = createRepositoryStub();
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(sourceRepository);
    const onLogChanged = vi.fn();
    const unsubscribe = adapter.subscribeLogs(onLogChanged);

    await adapter.hydrate();
    adapter.clearDerivedKeyCache();
    await adapter.deriveEncryptionKey('valid-master', 'salt');
    adapter.logQuery('SELECT 1;', 'SUCCESS', 1);
    unsubscribe();
    adapter.logQuery('SELECT 2;', 'SUCCESS', 1);

    expect(sourceRepository.hydrate).toHaveBeenCalledOnce();
    expect(sourceRepository.clearDerivedKeyCache).toHaveBeenCalledOnce();
    expect(sourceRepository.deriveEncryptionKey).toHaveBeenCalledWith('valid-master', 'salt');
    expect(onLogChanged).toHaveBeenCalledOnce();

    await expect(adapter.setupMaster('valid-master')).rejects.toThrow(WA_SQLITE_READ_ONLY_ERROR);
    await expect(adapter.changeMasterPassword('old-master', 'new-master')).rejects.toThrow(WA_SQLITE_READ_ONLY_ERROR);
    await expect(adapter.deletePermanently('item-1', 'valid-master')).rejects.toThrow(WA_SQLITE_READ_ONLY_ERROR);
    await expect(adapter.deletePermanentlyBatch(['item-1'], 'valid-master')).rejects.toThrow(WA_SQLITE_READ_ONLY_ERROR);
    await expect(adapter.reseedDemo('valid-master', [])).rejects.toThrow(WA_SQLITE_READ_ONLY_ERROR);

    expect(sourceRepository.setupMaster).not.toHaveBeenCalled();
    expect(sourceRepository.changeMasterPassword).not.toHaveBeenCalled();
    expect(sourceRepository.deletePermanently).not.toHaveBeenCalled();
    expect(sourceRepository.deletePermanentlyBatch).not.toHaveBeenCalled();
    expect(sourceRepository.reseedDemo).not.toHaveBeenCalled();
  });
});
