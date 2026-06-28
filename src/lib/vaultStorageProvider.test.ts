// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { sqliteOPFSInstance } from './sqlite_opfs';
import {
  ACTIVE_VAULT_STORAGE_BACKEND_KEY,
  clearPersistedActiveVaultStorageBackend,
  createVaultStorageMigrationRepositoryPair,
  createVaultStorageMigrationWriteTargetRepository,
  createVaultStorageRepositoryForPromotionPlan,
  createVaultStorageRepositoryForSelection,
  getActiveVaultStorageBackendSelection,
  getVaultStorageMigrationTargetRepository,
  getVaultStorageRepository,
  persistWaSqliteActiveBackendPromotion,
  promoteAndHydrateVaultStorageRepositoryFromPlan,
  promoteVaultStorageRepositoryFromPlan,
  readPersistedActiveVaultStorageBackend,
  restorePersistedActiveVaultStorageBackend,
  setVaultStorageRepositoryForTesting,
} from './vaultStorageProvider';
import type { VaultStorageRepository } from './vaultStorageRepository';
import {
  createWaSqlitePersistenceProfile,
  markWaSqlitePersistenceReadyForActiveBackend,
  WA_SQLITE_ACTIVE_BACKEND_BLOCKER,
  WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE,
} from './waSqlitePersistence';

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

afterEach(() => {
  clearPersistedActiveVaultStorageBackend();
  setVaultStorageRepositoryForTesting(sqliteOPFSInstance);
});

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

  it('creates the OPFS repository for active OPFS selections', () => {
    expect(createVaultStorageRepositoryForSelection({
      active: 'opfs',
      target: null,
      mode: 'active',
    })).toBe(sqliteOPFSInstance);
  });

  it('blocks active wa-sqlite repositories until the active persistence profile is explicitly ready', () => {
    expect(() => createVaultStorageRepositoryForSelection({
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    }, {
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', true),
    })).toThrow(WA_SQLITE_ACTIVE_BACKEND_BLOCKER);
  });

  it('creates an active wa-sqlite repository only with an explicitly ready persistent profile', () => {
    const repository = createVaultStorageRepositoryForSelection({
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    }, {
      persistenceProfile: markWaSqlitePersistenceReadyForActiveBackend(
        createWaSqlitePersistenceProfile('desktop-app-data', true),
      ),
    });

    expect(repository).toMatchObject({
      hydrate: expect.any(Function),
      setupMaster: expect.any(Function),
      verifyPassword: expect.any(Function),
      getVaultItems: expect.any(Function),
      saveVaultItems: expect.any(Function),
      resetAll: expect.any(Function),
    });
  });

  it('creates an active wa-sqlite repository from a verified promotion plan', () => {
    const persistenceProfile = markWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    );
    const repository = createVaultStorageRepositoryForPromotionPlan({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    });

    expect(repository).toMatchObject({
      hydrate: expect.any(Function),
      verifyPassword: expect.any(Function),
      saveVaultItems: expect.any(Function),
    });
  });

  it('rejects forged or blocked wa-sqlite promotion plans before repository creation', () => {
    const persistenceProfile = markWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    );

    expect(() => createVaultStorageRepositoryForPromotionPlan({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'blocked',
        issues: ['wa-sqlite-promotion-smoke-not-run'],
      },
    })).toThrow('vault-storage-promotion-plan-not-ready');

    expect(() => createVaultStorageRepositoryForPromotionPlan({
      selection: {
        active: 'opfs',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    })).toThrow('vault-storage-promotion-plan-active-wa-sqlite-required');
  });

  it('persists and reads a verified wa-sqlite active backend marker', () => {
    const persistenceProfile = markWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    );

    persistWaSqliteActiveBackendPromotion({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    });

    expect(readPersistedActiveVaultStorageBackend()).toMatchObject({
      version: 1,
      backend: 'wa-sqlite',
      persistenceProfile,
    });
  });

  it('restores a persisted wa-sqlite active backend only after hydration succeeds', async () => {
    const repository = createRepositoryStub();
    const persistenceProfile = markWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    );
    persistWaSqliteActiveBackendPromotion({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    });

    const restored = await restorePersistedActiveVaultStorageBackend({
      createRepository: (profile) => {
        expect(profile).toEqual(persistenceProfile);
        return repository;
      },
    });

    try {
      expect(restored).toBe(true);
      expect(repository.hydrate).toHaveBeenCalledTimes(1);
      expect(getVaultStorageRepository()).toBe(repository);
      expect(getActiveVaultStorageBackendSelection()).toEqual({
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      });
    } finally {
      setVaultStorageRepositoryForTesting(sqliteOPFSInstance);
    }
  });

  it('clears invalid persisted active backend markers without replacing OPFS', async () => {
    localStorage.setItem(ACTIVE_VAULT_STORAGE_BACKEND_KEY, JSON.stringify({
      version: 1,
      backend: 'wa-sqlite',
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', true),
      promotedAt: '2026-06-28T00:00:00.000Z',
    }));
    const previousRepository = getVaultStorageRepository();

    await expect(restorePersistedActiveVaultStorageBackend()).resolves.toBe(false);

    expect(localStorage.getItem(ACTIVE_VAULT_STORAGE_BACKEND_KEY)).toBeNull();
    expect(getVaultStorageRepository()).toBe(previousRepository);
  });

  it('clears the persisted marker and keeps the previous repository when persisted restore hydration fails', async () => {
    const repository = createRepositoryStub();
    vi.mocked(repository.hydrate).mockRejectedValueOnce(new Error('hydrate failed'));
    const persistenceProfile = markWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    );
    persistWaSqliteActiveBackendPromotion({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    });
    const previousRepository = getVaultStorageRepository();

    await expect(restorePersistedActiveVaultStorageBackend({
      createRepository: () => repository,
    })).resolves.toBe(false);

    expect(localStorage.getItem(ACTIVE_VAULT_STORAGE_BACKEND_KEY)).toBeNull();
    expect(getVaultStorageRepository()).toBe(previousRepository);
    expect(getActiveVaultStorageBackendSelection()).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
  });

  it('promotes the active repository from a verified wa-sqlite plan and can restore the previous repository', () => {
    const persistenceProfile = markWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    );
    const previousRepository = getVaultStorageRepository();
    const result = promoteVaultStorageRepositoryFromPlan({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    });

    try {
      expect(getVaultStorageRepository()).toBe(result.repository);
      expect(getVaultStorageRepository()).not.toBe(previousRepository);
      expect(getActiveVaultStorageBackendSelection()).toEqual({
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      });
    } finally {
      result.restorePreviousRepository();
    }

    expect(getVaultStorageRepository()).toBe(previousRepository);
    expect(getActiveVaultStorageBackendSelection()).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
  });

  it('hydrates a verified wa-sqlite repository before making it active', async () => {
    const repository = createRepositoryStub();
    const previousRepository = getVaultStorageRepository();
    const result = await promoteAndHydrateVaultStorageRepositoryFromPlan({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile: markWaSqlitePersistenceReadyForActiveBackend(
        createWaSqlitePersistenceProfile('desktop-app-data', true),
      ),
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    }, {
      createRepository: () => repository,
    });

    try {
      expect(repository.hydrate).toHaveBeenCalledTimes(1);
      expect(getVaultStorageRepository()).toBe(repository);
      expect(result.repository).toBe(repository);
      expect(getActiveVaultStorageBackendSelection()).toEqual({
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      });
    } finally {
      result.restorePreviousRepository();
    }

    expect(getVaultStorageRepository()).toBe(previousRepository);
    expect(getActiveVaultStorageBackendSelection()).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
  });

  it('keeps the previous active repository when hydrated promotion fails', async () => {
    const repository = createRepositoryStub();
    vi.mocked(repository.hydrate).mockRejectedValueOnce(new Error('hydrate failed'));
    const previousRepository = getVaultStorageRepository();

    await expect(promoteAndHydrateVaultStorageRepositoryFromPlan({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile: markWaSqlitePersistenceReadyForActiveBackend(
        createWaSqlitePersistenceProfile('desktop-app-data', true),
      ),
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    }, {
      createRepository: () => repository,
    })).rejects.toThrow('hydrate failed');

    expect(getVaultStorageRepository()).toBe(previousRepository);
  });

  it('does not replace the active repository when promotion plan validation fails', () => {
    const persistenceProfile = markWaSqlitePersistenceReadyForActiveBackend(
      createWaSqlitePersistenceProfile('desktop-app-data', true),
    );
    const previousRepository = getVaultStorageRepository();

    expect(() => promoteVaultStorageRepositoryFromPlan({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile,
      readinessReport: {
        status: 'blocked',
        issues: ['wa-sqlite-promotion-smoke-not-run'],
      },
    })).toThrow('vault-storage-promotion-plan-not-ready');

    expect(getVaultStorageRepository()).toBe(previousRepository);
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

  it('creates a wa-sqlite migration repository pair that reopens the same persistent profile', () => {
    const persistenceProfile = createWaSqlitePersistenceProfile('android-app-private', true);
    const pair = createVaultStorageMigrationRepositoryPair('wa-sqlite', { persistenceProfile });
    const reopenedRepository = pair.reopenTargetRepository();

    expect(pair.persistenceProfile).toBe(persistenceProfile);
    expect(pair.targetRepository).toMatchObject({
      hydrate: expect.any(Function),
      setupMaster: expect.any(Function),
      saveVaultItems: expect.any(Function),
      getVaultItems: expect.any(Function),
      resetAll: expect.any(Function),
    });
    expect(reopenedRepository).toMatchObject({
      hydrate: expect.any(Function),
      verifyPassword: expect.any(Function),
      getVaultItems: expect.any(Function),
    });
    expect(reopenedRepository).not.toBe(pair.targetRepository);
  });

  it('blocks wa-sqlite migration repository pairs when persistent storage is unavailable', () => {
    expect(() => createVaultStorageMigrationRepositoryPair('wa-sqlite', {
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', false),
    })).toThrow(WA_SQLITE_PERSISTENT_VFS_UNAVAILABLE);
    expect(() => createVaultStorageMigrationRepositoryPair(null)).toThrow(
      'vault-storage-migration-target-unsupported',
    );
  });

  it('can temporarily swap the active repository and backend selection for migration tests', () => {
    const repository = createRepositoryStub();
    const restore = setVaultStorageRepositoryForTesting(repository, {
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    });

    expect(getVaultStorageRepository()).toBe(repository);
    expect(getActiveVaultStorageBackendSelection()).toEqual({
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    });

    restore();

    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
    expect(getActiveVaultStorageBackendSelection()).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
  });
});
