// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import { runWaSqlitePersistentMigrationCandidate } from './vaultStorageMigrationCandidate';
import type { VaultStorageRepository } from './vaultStorageRepository';
import { createWaSqlitePersistenceProfile, WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE } from './waSqlitePersistence';

function item(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Example',
    username: 'user@example.com',
    password: 'Secret-123!',
    url: 'https://example.test',
    notes: 'private note',
    category: 'login',
    favorite: false,
    deleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function repositoryStub(items: VaultItem[], isPasswordValid = true): VaultStorageRepository {
  let storedItems = items.map((candidate) => ({ ...candidate }));

  return {
    hydrate: vi.fn(async () => undefined),
    clearDerivedKeyCache: vi.fn(),
    subscribeLogs: vi.fn(() => vi.fn()),
    getQueryLogs: vi.fn(() => []),
    logQuery: vi.fn(),
    verifyPassword: vi.fn(async () => isPasswordValid),
    setupMaster: vi.fn(async () => undefined),
    changeMasterPassword: vi.fn(async () => undefined),
    deriveEncryptionKey: vi.fn(async () => new Uint8Array(32)),
    getVaultItems: vi.fn(async () => storedItems.map((candidate) => ({ ...candidate }))),
    getVaultItemsWithKey: vi.fn(async () => storedItems.map((candidate) => ({ ...candidate }))),
saveVaultItem: vi.fn(async (candidate: VaultItem) => {
      storedItems = [candidate];
      return storedItems.map((saved) => ({ ...saved }));
    }),
    saveVaultItems: vi.fn(async (candidates: VaultItem[]) => {
      storedItems = candidates.map((candidate) => ({ ...candidate }));
      return storedItems.map((candidate) => ({ ...candidate }));
    }),
    executeCustomSQL: vi.fn(() => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => {
      storedItems = [];
    }),
    deletePermanently: vi.fn(async () => []),
    deletePermanentlyBatch: vi.fn(async () => []),
    reseedDemo: vi.fn(async () => []),
  };
}

function passingSmoke() {
  return vi.fn(async () => ({
    status: 'passed' as const,
    databaseName: '/aegis-wa-sqlite.test.db',
    vfsName: 'aegis-wa-sqlite-test-idb',
  }));
}

describe('wa-sqlite persistent migration candidate', () => {
  it('runs OPFS to persistent wa-sqlite migration with the same-profile reopen repository', async () => {
    const sourceRepository = repositoryStub([item(), item({ id: 'item-2', title: 'Second' })]);
    const targetRepository = repositoryStub([]);
    const reopenedRepository = repositoryStub([item(), item({ id: 'item-2', title: 'Second' })]);
    const reopenTargetRepository = vi.fn(() => reopenedRepository);
    const persistenceProfile = createWaSqlitePersistenceProfile('desktop-app-data', true);

    await expect(runWaSqlitePersistentMigrationCandidate('master-pass', {
      sourceRepository,
      verifyPersistentTarget: passingSmoke(),
      migrationPair: {
        targetRepository,
        reopenTargetRepository,
        persistenceProfile,
      },
    })).resolves.toEqual({
      migrationResult: {
        status: 'migrated',
        sourceBackend: 'opfs',
        targetBackend: 'wa-sqlite',
        itemCount: 2,
        targetItemCount: 2,
        issues: [],
      },
      persistenceProfile,
    });

    expect(reopenTargetRepository).toHaveBeenCalledOnce();
    expect(reopenedRepository.verifyPassword).toHaveBeenCalledWith('master-pass');
  });

  it('blocks before target writes when persistent wa-sqlite smoke fails', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    const persistenceProfile = createWaSqlitePersistenceProfile('desktop-app-data', true);

    await expect(runWaSqlitePersistentMigrationCandidate('master-pass', {
      sourceRepository,
      verifyPersistentTarget: async () => ({
        status: 'failed' as const,
        databaseName: persistenceProfile.databaseName,
        vfsName: persistenceProfile.vfsName,
        issue: 'wa-sqlite-persistence-smoke-mismatch',
      }),
      migrationPair: {
        targetRepository,
        reopenTargetRepository: () => repositoryStub([]),
        persistenceProfile,
      },
    })).resolves.toEqual({
      migrationResult: {
        status: 'blocked',
        sourceBackend: 'opfs',
        targetBackend: 'wa-sqlite',
        itemCount: 1,
        targetItemCount: 0,
        issues: [
          'vault-storage-migration-persistent-target-smoke-failed',
          'wa-sqlite-persistence-smoke-mismatch',
        ],
      },
      persistenceProfile,
    });

    expect(targetRepository.resetAll).not.toHaveBeenCalled();
    expect(targetRepository.saveVaultItems).not.toHaveBeenCalled();
  });

  it('fails closed when the migration pair factory rejects persistent storage', async () => {
    await expect(runWaSqlitePersistentMigrationCandidate('master-pass', {
      sourceRepository: repositoryStub([item()]),
      createMigrationPair: () => {
        throw new Error(WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE);
      },
    })).rejects.toThrow(WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE);
  });
});
