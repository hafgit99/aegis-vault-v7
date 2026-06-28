/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sqliteOPFSInstance } from './sqlite_opfs';
import {
  getVaultStorageBackendSelection,
  type VaultStorageBackendSelection,
} from './vaultStorageBackend';
import { createReadOnlyWaSqliteVaultStorageAdapter } from './vaultStorageWaSqliteAdapter';
import type { WaSqliteActiveBackendPromotionPlan } from './waSqlitePromotionReadiness';
import type { VaultStorageRepository } from './vaultStorageRepository';
import { createWaSqliteEngine } from './waSqliteEngine';
import {
  assertWaSqlitePersistenceReadyForActiveBackend,
  assertWaSqlitePersistenceReadyForMigrationTarget,
  createWaSqlitePersistenceProfile,
  type WaSqlitePersistenceProfile,
} from './waSqlitePersistence';
import { createWaSqliteVaultStorageRepository } from './waSqliteVaultStorageRepository';

let activeVaultStorageRepository: VaultStorageRepository = sqliteOPFSInstance;

export function getVaultStorageRepository(): VaultStorageRepository {
  return activeVaultStorageRepository;
}

export function getActiveVaultStorageBackendSelection() {
  return getVaultStorageBackendSelection();
}

export interface VaultStorageRepositoryPromotionResult {
  repository: VaultStorageRepository;
  restorePreviousRepository: () => void;
}

export function promoteVaultStorageRepositoryFromPlan(
  plan: WaSqliteActiveBackendPromotionPlan,
): VaultStorageRepositoryPromotionResult {
  const previousRepository = activeVaultStorageRepository;
  const repository = createVaultStorageRepositoryForPromotionPlan(plan);
  activeVaultStorageRepository = repository;

  return {
    repository,
    restorePreviousRepository: () => {
      activeVaultStorageRepository = previousRepository;
    },
  };
}

export interface VaultStorageActiveRepositoryOptions {
  persistenceProfile?: WaSqlitePersistenceProfile;
}

export function createVaultStorageRepositoryForPromotionPlan(
  plan: WaSqliteActiveBackendPromotionPlan,
): VaultStorageRepository {
  if (plan.readinessReport.status !== 'ready') {
    throw new Error('vault-storage-promotion-plan-not-ready');
  }
  if (
    plan.selection.active !== 'wa-sqlite'
    || plan.selection.mode !== 'active'
    || plan.selection.target !== null
  ) {
    throw new Error('vault-storage-promotion-plan-active-wa-sqlite-required');
  }

  return createVaultStorageRepositoryForSelection(plan.selection, {
    persistenceProfile: plan.persistenceProfile,
  });
}

export function createVaultStorageRepositoryForSelection(
  selection: VaultStorageBackendSelection = getVaultStorageBackendSelection(),
  options: VaultStorageActiveRepositoryOptions = {},
): VaultStorageRepository {
  if (selection.active === 'opfs') {
    return sqliteOPFSInstance;
  }

  const persistenceProfile = options.persistenceProfile ?? createWaSqlitePersistenceProfile();
  assertWaSqlitePersistenceReadyForActiveBackend(persistenceProfile);

  return createWaSqliteVaultStorageRepository({
    engine: createWaSqliteEngine({ persistenceProfile }),
  });
}

export function getVaultStorageMigrationTargetRepository(
  selection: VaultStorageBackendSelection = getVaultStorageBackendSelection(),
): VaultStorageRepository | null {
  if (selection.mode === 'dry-run' && selection.target === 'wa-sqlite') {
    return createReadOnlyWaSqliteVaultStorageAdapter(activeVaultStorageRepository, {
      engine: createWaSqliteEngine(),
      mirrorSourceOnEmptyEngine: true,
    });
  }

  return null;
}

export interface VaultStorageMigrationWriteTargetRepositoryOptions {
  persistenceProfile?: WaSqlitePersistenceProfile;
}

export interface VaultStorageMigrationRepositoryPair {
  targetRepository: VaultStorageRepository;
  reopenTargetRepository: () => VaultStorageRepository;
  persistenceProfile: WaSqlitePersistenceProfile;
}

export function createVaultStorageMigrationWriteTargetRepository(
  targetBackend: VaultStorageBackendSelection['target'] = 'wa-sqlite',
  options: VaultStorageMigrationWriteTargetRepositoryOptions = {},
): VaultStorageRepository {
  if (targetBackend !== 'wa-sqlite') {
    throw new Error('vault-storage-migration-target-unsupported');
  }

  const persistenceProfile = options.persistenceProfile ?? createWaSqlitePersistenceProfile();
  assertWaSqlitePersistenceReadyForMigrationTarget(persistenceProfile);

  return createWaSqliteVaultStorageRepository({
    engine: createWaSqliteEngine({ persistenceProfile }),
  });
}

export function createVaultStorageMigrationRepositoryPair(
  targetBackend: VaultStorageBackendSelection['target'] = 'wa-sqlite',
  options: VaultStorageMigrationWriteTargetRepositoryOptions = {},
): VaultStorageMigrationRepositoryPair {
  if (targetBackend !== 'wa-sqlite') {
    throw new Error('vault-storage-migration-target-unsupported');
  }

  const persistenceProfile = options.persistenceProfile ?? createWaSqlitePersistenceProfile();
  assertWaSqlitePersistenceReadyForMigrationTarget(persistenceProfile);

  const createRepository = () => createWaSqliteVaultStorageRepository({
    engine: createWaSqliteEngine({ persistenceProfile }),
  });

  return {
    targetRepository: createRepository(),
    reopenTargetRepository: createRepository,
    persistenceProfile,
  };
}

export function setVaultStorageRepositoryForTesting(repository: VaultStorageRepository): () => void {
  const previousRepository = activeVaultStorageRepository;
  activeVaultStorageRepository = repository;

  return () => {
    activeVaultStorageRepository = previousRepository;
  };
}
