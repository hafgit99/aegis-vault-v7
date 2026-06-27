// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { createVaultStorageMigrationWriteTargetRepository, getActiveVaultStorageBackendSelection, getVaultStorageMigrationTargetRepository, getVaultStorageRepository, setVaultStorageRepositoryForTesting } from './vaultStorageProvider';
import type { VaultStorageRepository } from './vaultStorageRepository';
import { createWaSqlitePersistenceProfile, WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE } from './waSqlitePersistence';

function createRepositoryStub(): VaultStorageRepository {
  return {
    hydrate: vi.fn(async () => undefined),
    clearDerivedKeyCache: vi.fn(),
    subscribeLogs: vi.fn(() => vi.fn()),
    getQueryLogs: vi.fn(() => []),
    logQuery: vi.fn(),
    verifyPassword: vi.fn(async () => false),
    setupMaster: vi.fn(async () => undefined),
    changeMasterPassword: vi.fn(async () => undefined),
    deriveEncryptionKey: vi.fn(async () => new Uint8Array(32)),
    getVaultItems: vi.fn(async () => []),
    saveVaultItem: vi.fn(async () => []),
    saveVaultItems: vi.fn(async () => []),
    executeCustomSQL: vi.fn(() => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => undefined),
    deletePermanently: vi.fn(async () => []),
    deletePermanentlyBatch: vi.fn(async () => []),
    reseedDemo: vi.fn(async () => []),
  };
}

describe('vault storage provider', () => {
  it('uses the OPFS repository by default', () => {
    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
  });

  it('exposes the active backend selection for migration orchestration', () => {
    expect(getActiveVaultStorageBackendSelection()).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
  });

  it('does not expose a migration target unless dry-run is enabled', () => {
    expect(getVaultStorageMigrationTargetRepository()).toBeNull();
  });

  it('exposes a read-only wa-sqlite migration target during dry-run', async () => {
    const repository = createRepositoryStub();
    const restore = setVaultStorageRepositoryForTesting(repository);

    try {
      const targetRepository = getVaultStorageMigrationTargetRepository({
        active: 'opfs',
        target: 'wa-sqlite',
        mode: 'dry-run',
      });

      expect(targetRepository).not.toBeNull();
      expect(await targetRepository?.verifyPassword('master')).toBe(false);
      expect(repository.verifyPassword).toHaveBeenCalledWith('master');
      await expect(targetRepository?.saveVaultItems([], 'master')).rejects.toThrow('wa-sqlite-adapter-read-only');
      expect(repository.saveVaultItems).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('creates an explicit wa-sqlite write target for controlled migrations', () => {
    const targetRepository = createVaultStorageMigrationWriteTargetRepository('wa-sqlite', {
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', true),
    });

    expect(targetRepository).toMatchObject({
      hydrate: expect.any(Function),
      setupMaster: expect.any(Function),
      saveVaultItems: expect.any(Function),
      getVaultItems: expect.any(Function),
      resetAll: expect.any(Function),
    });
    expect(() => createVaultStorageMigrationWriteTargetRepository(null)).toThrow(
      'vault-storage-migration-target-unsupported',
    );
  });

  it('blocks wa-sqlite migration write targets when persistent storage is unavailable', () => {
    expect(() => createVaultStorageMigrationWriteTargetRepository('wa-sqlite', {
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', false),
    })).toThrow(WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE);
  });

  it('can temporarily swap the active repository for migration tests', () => {
    const repository = createRepositoryStub();
    const restore = setVaultStorageRepositoryForTesting(repository);

    expect(getVaultStorageRepository()).toBe(repository);

    restore();

    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
  });
});
