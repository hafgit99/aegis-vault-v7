/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import type { VaultStorageRepository } from './vaultStorageRepository';
import { createWaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { WaSqliteEngine } from './waSqliteEngine';
import {
  createReadOnlyWaSqliteVaultStorageAdapter,
  WA_SQLITE_ENGINE_READ_ERROR,
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

function createEngineStub(rows: Array<Record<string, unknown>> = []): WaSqliteEngine {
  return {
    initialize: vi.fn(async () => ({
      initialized: true,
      databaseName: 'mirror.db',
      tableCount: 4,
      persistenceProfile: createWaSqlitePersistenceProfile(),
    })),
    execute: vi.fn(async () => ({ columns: [], rows: [] })),
    executeReadOnly: vi.fn(async () => ({ columns: [], rows: [] })),
    selectObjects: vi.fn(async () => rows),
    close: vi.fn(async () => undefined),
  };
}

function sampleItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Example',
    username: 'owner',
    password: 'secret-value',
    url: 'https://example.com',
    category: 'login',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('read-only wa-sqlite vault storage adapter', () => {
  it('mirrors source reads without exposing mutable item references', async () => {
    const item = sampleItem({ password: undefined });
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

  it('initializes an optional wa-sqlite engine during hydrate', async () => {
    const sourceRepository = createRepositoryStub();
    const engine = createEngineStub();
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(sourceRepository, { engine });

    await adapter.hydrate();

    expect(sourceRepository.hydrate).toHaveBeenCalledOnce();
    expect(engine.initialize).toHaveBeenCalledOnce();
    expect(adapter.getQueryLogs()[0]).toMatchObject({ status: 'SUCCESS', rowsAffected: 4 });
  });

  it('merges wa-sqlite row metadata with decrypted source item data', async () => {
    const sourceItem = sampleItem({ favorite: false, deleted: false });
    const sourceRepository = createRepositoryStub([sourceItem]);
    const engine = createEngineStub([
      {
        id: 'item-1',
        title: 'Engine Title',
        category: 'secure_note',
        favorite: 1,
        deleted: 0,
        deleted_at: null,
        created_at: '2026-02-01',
        updated_at: '2026-02-02',
      },
    ]);
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(sourceRepository, { engine });

    const items = await adapter.getVaultItems('valid-master');

    expect(sourceRepository.getVaultItems).toHaveBeenCalledWith('valid-master');
    expect(engine.selectObjects).toHaveBeenCalledWith(expect.stringContaining('FROM vault_items'));
    expect(items).toEqual([
      {
        ...sourceItem,
        title: 'Example',
        category: 'secure_note',
        favorite: true,
        deleted: false,
        deletedAt: undefined,
        createdAt: '2026-02-01',
        updatedAt: '2026-02-02',
      },
    ]);
  });

  it('falls back to source copies when the engine table is empty', async () => {
    const sourceItem = sampleItem();
    const sourceRepository = createRepositoryStub([sourceItem]);
    const engine = createEngineStub([]);
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(sourceRepository, { engine });

    const items = await adapter.getVaultItems('valid-master');

    expect(items).toEqual([sourceItem]);
    expect(items[0]).not.toBe(sourceItem);
    expect(adapter.getQueryLogs()[0].query).toBe('WA_SQLITE_MIRROR SELECT vault_items FROM source fallback;');
  });

  it('can seed empty wa-sqlite metadata from source items during dry-run reads', async () => {
    const mirroredRows: Array<Record<string, unknown>> = [];
    const sourceItem = sampleItem({
      title: "Source's Login",
      username: 'private-user',
      password: 'private-password',
      favorite: true,
    });
    const sourceRepository = createRepositoryStub([sourceItem]);
    const engine = createEngineStub(mirroredRows);
    vi.mocked(engine.execute).mockImplementation(async (sql: string) => {
      if (sql.startsWith('DELETE FROM vault_items')) {
        mirroredRows.length = 0;
      }

      if (sql.startsWith('INSERT INTO vault_items')) {
        mirroredRows.push({
          id: 'item-1',
          title: "Source's Login",
          category: 'login',
          favorite: 1,
          deleted: 0,
          deleted_at: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
        });
      }

      return { columns: [], rows: [] };
    });
    const adapter = createReadOnlyWaSqliteVaultStorageAdapter(sourceRepository, {
      engine,
      mirrorSourceOnEmptyEngine: true,
    });

    const items = await adapter.getVaultItems('valid-master');
    const executedSql = vi.mocked(engine.execute).mock.calls.map(([sql]) => sql).join('\n');

    expect(items).toEqual([{ ...sourceItem, favorite: true, deleted: false, deletedAt: undefined }]);
    expect(engine.selectObjects).toHaveBeenCalledTimes(2);
    expect(executedSql).toContain("'[encrypted: aes-256-gcm]'");
    expect(executedSql).not.toContain('private-user');
    expect(executedSql).not.toContain('private-password');
    expect(adapter.getQueryLogs()[1].query).toBe('WA_SQLITE_MIRROR seed vault_items metadata from source;');
  });

  it('fails closed when the engine cannot be initialized or queried', async () => {
    const initializeFailureEngine = createEngineStub();
    vi.mocked(initializeFailureEngine.initialize).mockRejectedValueOnce(new Error('open failed'));
    const hydrateAdapter = createReadOnlyWaSqliteVaultStorageAdapter(createRepositoryStub(), {
      engine: initializeFailureEngine,
    });

    await expect(hydrateAdapter.hydrate()).rejects.toThrow(WA_SQLITE_ENGINE_READ_ERROR);
    expect(hydrateAdapter.getQueryLogs()[0]).toMatchObject({ status: 'ERROR', rowsAffected: 0 });

    const queryFailureEngine = createEngineStub();
    vi.mocked(queryFailureEngine.selectObjects).mockRejectedValueOnce(new Error('select failed'));
    const queryAdapter = createReadOnlyWaSqliteVaultStorageAdapter(createRepositoryStub([sampleItem()]), {
      engine: queryFailureEngine,
    });

    await expect(queryAdapter.getVaultItems('valid-master')).rejects.toThrow(WA_SQLITE_ENGINE_READ_ERROR);
    expect(queryAdapter.getQueryLogs()[0]).toMatchObject({ status: 'ERROR', rowsAffected: 0 });
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
