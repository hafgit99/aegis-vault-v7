// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import { runWaSqliteActiveBackendMigration } from './vaultStorageActiveMigration';
import type { VaultStorageMigrationRepositoryPair } from './vaultStorageProvider';
import type {
  SQLCommandLog,
  SQLCommandStatus,
  VaultStorageQueryResult,
  VaultStorageRepository,
} from './vaultStorageRepository';
import { createWaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { WaSqlitePersistenceSmokeResult } from './waSqlitePersistenceSmoke';

const item: VaultItem = {
  id: 'login-1',
  title: 'Example',
  username: 'ada',
  password: 'correct horse battery staple',
  url: 'https://example.com',
  category: 'login',
  favorite: true,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-02',
};

function createRepositoryStub(options: {
  passwordValid?: boolean;
  initialItems?: VaultItem[];
} = {}): VaultStorageRepository {
  let items = [...(options.initialItems ?? [])];
  let setupPassword: string | null = options.passwordValid === false ? null : 'master-pass';
  const logs: SQLCommandLog[] = [];

  return {
    hydrate: vi.fn(async () => undefined),
    clearDerivedKeyCache: vi.fn(),
    subscribeLogs: vi.fn(() => vi.fn()),
    getQueryLogs: vi.fn(() => logs),
    logQuery: vi.fn((query: string, status: SQLCommandStatus, rowsAffected: number) => {
      logs.push({
        id: `log-${logs.length + 1}`,
        timestamp: '12:00:00',
        query,
        status,
        rowsAffected,
      });
    }),
    verifyPassword: vi.fn(async (password: string) => setupPassword === password),
    setupMaster: vi.fn(async (password: string) => {
      setupPassword = password;
    }),
    changeMasterPassword: vi.fn(async (_oldPassword: string, newPassword: string) => {
      setupPassword = newPassword;
    }),
    deriveEncryptionKey: vi.fn(async () => new Uint8Array(32)),
    getVaultItems: vi.fn(async (password: string) => {
      if (setupPassword !== password) {
        throw new Error('invalid-password');
      }
      return items.map((storedItem) => ({ ...storedItem }));
    }),
    saveVaultItem: vi.fn(async (nextItem: VaultItem, password: string) => {
      if (setupPassword !== password) {
        throw new Error('invalid-password');
      }
      items = [...items.filter((storedItem) => storedItem.id !== nextItem.id), { ...nextItem }];
      return items.map((storedItem) => ({ ...storedItem }));
    }),
    saveVaultItems: vi.fn(async (nextItems: VaultItem[], password: string, onProgress?: (count: number) => void) => {
      if (setupPassword !== password) {
        throw new Error('invalid-password');
      }
      items = nextItems.map((storedItem) => ({ ...storedItem }));
      items.forEach((_, index) => onProgress?.(index + 1));
      return items.map((storedItem) => ({ ...storedItem }));
    }),
    executeCustomSQL: vi.fn((): VaultStorageQueryResult => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => {
      items = [];
      setupPassword = null;
    }),
    deletePermanently: vi.fn(async (id: string, password: string) => {
      if (setupPassword !== password) {
        throw new Error('invalid-password');
      }
      items = items.filter((storedItem) => storedItem.id !== id);
      return items.map((storedItem) => ({ ...storedItem }));
    }),
    deletePermanentlyBatch: vi.fn(async (ids: string[], password: string) => {
      if (setupPassword !== password) {
        throw new Error('invalid-password');
      }
      items = items.filter((storedItem) => !ids.includes(storedItem.id));
      return items.map((storedItem) => ({ ...storedItem }));
    }),
    reseedDemo: vi.fn(async (password: string, demoItems: VaultItem[]) => {
      if (setupPassword !== password) {
        throw new Error('invalid-password');
      }
      items = demoItems.map((storedItem) => ({ ...storedItem }));
      return items.map((storedItem) => ({ ...storedItem }));
    }),
  };
}

function passedSmoke(): WaSqlitePersistenceSmokeResult {
  return {
    status: 'passed',
    databaseName: '/aegis-wa-sqlite.test.db',
    vfsName: 'aegis-wa-sqlite-test-idb',
  };
}

function createMigrationPair(targetRepository: VaultStorageRepository): VaultStorageMigrationRepositoryPair {
  return {
    targetRepository,
    reopenTargetRepository: () => targetRepository,
    persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', true),
  };
}

describe('wa-sqlite active backend migration orchestration', () => {
  it('runs smoke, persistent migration, dry-run parity, readiness, and hydrate-first promotion', async () => {
    const sourceRepository = createRepositoryStub({ initialItems: [item] });
    const targetRepository = createRepositoryStub();
    const promotionRepository = createRepositoryStub();
    const restorePreviousRepository = vi.fn();
    const persistPromotion = vi.fn();
    const promoteRepository = vi.fn(async () => ({
      repository: promotionRepository,
      restorePreviousRepository,
    }));

    const result = await runWaSqliteActiveBackendMigration('master-pass', {
      sourceRepository,
      migrationPair: createMigrationPair(targetRepository),
      verifyPersistentTarget: vi.fn(async () => passedSmoke()),
      promoteRepository,
      persistPromotion,
    });

    expect(result.status).toBe('promoted');
    expect(result.issues).toEqual([]);
    expect(result.readinessReport).toEqual({ status: 'ready', issues: [] });
    expect(result.dryRunResult).toMatchObject({
      status: 'ready',
      itemCount: 1,
      targetItemCount: 1,
      issues: [],
    });
    expect(result.persistentMigrationCandidateResult?.migrationResult).toMatchObject({
      status: 'migrated',
      itemCount: 1,
      targetItemCount: 1,
    });
    expect(promoteRepository).toHaveBeenCalledTimes(1);
    expect(persistPromotion).toHaveBeenCalledTimes(1);
    expect(promoteRepository).toHaveBeenCalledWith(expect.objectContaining({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    }));
    expect(result.promotionResult?.repository).toBe(promotionRepository);
  });

  it('returns a sanitized blocker when active repository promotion fails', async () => {
    const sourceRepository = createRepositoryStub({ initialItems: [item] });
    const targetRepository = createRepositoryStub();
    const persistPromotion = vi.fn();
    const promoteRepository = vi.fn(async () => {
      throw new Error('hydrate failed\n<script>secret</script>');
    });

    const result = await runWaSqliteActiveBackendMigration('master-pass', {
      sourceRepository,
      migrationPair: createMigrationPair(targetRepository),
      verifyPersistentTarget: vi.fn(async () => passedSmoke()),
      promoteRepository,
      persistPromotion,
    });

    expect(result.status).toBe('blocked');
    expect(result.issues).toEqual(['hydrate failed &lt;script_secret_/script_']);
    expect(result.readinessReport).toEqual({ status: 'ready', issues: [] });
    expect(result.promotionResult).toBeNull();
    expect(promoteRepository).toHaveBeenCalledTimes(1);
    expect(persistPromotion).not.toHaveBeenCalled();
  });

  it('rolls back active repository promotion when the persisted backend marker cannot be written', async () => {
    const sourceRepository = createRepositoryStub({ initialItems: [item] });
    const targetRepository = createRepositoryStub();
    const promotionRepository = createRepositoryStub();
    const restorePreviousRepository = vi.fn();
    const promoteRepository = vi.fn(async () => ({
      repository: promotionRepository,
      restorePreviousRepository,
    }));

    const result = await runWaSqliteActiveBackendMigration('master-pass', {
      sourceRepository,
      migrationPair: createMigrationPair(targetRepository),
      verifyPersistentTarget: vi.fn(async () => passedSmoke()),
      promoteRepository,
      persistPromotion: vi.fn(() => {
        throw new Error('quota exceeded');
      }),
    });

    expect(result.status).toBe('blocked');
    expect(result.issues).toEqual(['wa-sqlite-active-backend-marker-write-failed']);
    expect(result.promotionResult).toBeNull();
    expect(restorePreviousRepository).toHaveBeenCalledTimes(1);
  });

  it('blocks before migration and promotion when persistent smoke fails', async () => {
    const sourceRepository = createRepositoryStub({ initialItems: [item] });
    const targetRepository = createRepositoryStub();
    const promoteRepository = vi.fn();

    const result = await runWaSqliteActiveBackendMigration('master-pass', {
      sourceRepository,
      migrationPair: createMigrationPair(targetRepository),
      verifyPersistentTarget: vi.fn(async (): Promise<WaSqlitePersistenceSmokeResult> => ({
        status: 'failed',
        databaseName: '/aegis-wa-sqlite.test.db',
        vfsName: 'aegis-wa-sqlite-test-idb',
        issue: 'wa-sqlite-persistence-smoke-mismatch',
      })),
      promoteRepository,
    });

    expect(result.status).toBe('blocked');
    expect(result.issues).toEqual([
      'wa-sqlite-promotion-smoke-failed',
      'wa-sqlite-persistence-smoke-mismatch',
      'wa-sqlite-promotion-dry-run-not-run',
      'wa-sqlite-promotion-persistent-migration-candidate-not-run',
      'wa-sqlite-promotion-migration-not-run',
    ]);
    expect(result.persistentMigrationCandidateResult).toBeNull();
    expect(result.dryRunResult).toBeNull();
    expect(promoteRepository).not.toHaveBeenCalled();
    expect(targetRepository.resetAll).not.toHaveBeenCalled();
  });

  it('blocks promotion when the persistent migration candidate cannot unlock the source', async () => {
    const sourceRepository = createRepositoryStub({ passwordValid: false, initialItems: [item] });
    const targetRepository = createRepositoryStub();
    const promoteRepository = vi.fn();

    const result = await runWaSqliteActiveBackendMigration('master-pass', {
      sourceRepository,
      migrationPair: createMigrationPair(targetRepository),
      verifyPersistentTarget: vi.fn(async () => passedSmoke()),
      promoteRepository,
    });

    expect(result.status).toBe('blocked');
    expect(result.issues).toEqual([
      'wa-sqlite-promotion-dry-run-not-run',
      'wa-sqlite-promotion-migration-not-migrated',
      'vault-storage-migration-invalid-source-password',
    ]);
    expect(result.persistentMigrationCandidateResult?.migrationResult.status).toBe('blocked');
    expect(result.dryRunResult).toBeNull();
    expect(promoteRepository).not.toHaveBeenCalled();
  });
});
