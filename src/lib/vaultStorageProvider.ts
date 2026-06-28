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

export const ACTIVE_VAULT_STORAGE_BACKEND_KEY = 'aegis_vault_storage_active_backend';

interface PersistedActiveVaultStorageBackend {
  version: 1;
  backend: 'wa-sqlite';
  persistenceProfile: WaSqlitePersistenceProfile;
  promotedAt: string;
}

let activeVaultStorageRepository: VaultStorageRepository = sqliteOPFSInstance;

export function getVaultStorageRepository(): VaultStorageRepository {
  return activeVaultStorageRepository;
}

export function getActiveVaultStorageBackendSelection() {
  return getVaultStorageBackendSelection();
}

function getBrowserStorage(): Storage | null {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

export function clearPersistedActiveVaultStorageBackend(): void {
  getBrowserStorage()?.removeItem(ACTIVE_VAULT_STORAGE_BACKEND_KEY);
}

export function persistWaSqliteActiveBackendPromotion(plan: WaSqliteActiveBackendPromotionPlan): void {
  assertVaultStoragePromotionPlanReady(plan);
  assertWaSqlitePersistenceReadyForActiveBackend(plan.persistenceProfile);

  const storage = getBrowserStorage();
  if (!storage) {
    throw new Error('vault-storage-active-backend-marker-unavailable');
  }

  const marker: PersistedActiveVaultStorageBackend = {
    version: 1,
    backend: 'wa-sqlite',
    persistenceProfile: plan.persistenceProfile,
    promotedAt: new Date().toISOString(),
  };
  storage.setItem(ACTIVE_VAULT_STORAGE_BACKEND_KEY, JSON.stringify(marker));
}

export function readPersistedActiveVaultStorageBackend(): PersistedActiveVaultStorageBackend | null {
  const raw = getBrowserStorage()?.getItem(ACTIVE_VAULT_STORAGE_BACKEND_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PersistedActiveVaultStorageBackend;
    if (!isPersistedActiveVaultStorageBackend(parsed)) {
      clearPersistedActiveVaultStorageBackend();
      return null;
    }
    return parsed;
  } catch {
    clearPersistedActiveVaultStorageBackend();
    return null;
  }
}

export interface RestorePersistedVaultStorageBackendOptions {
  createRepository?: (profile: WaSqlitePersistenceProfile) => VaultStorageRepository;
}

export async function restorePersistedActiveVaultStorageBackend(
  options: RestorePersistedVaultStorageBackendOptions = {},
): Promise<boolean> {
  const marker = readPersistedActiveVaultStorageBackend();
  if (!marker) return false;

  try {
    assertWaSqlitePersistenceReadyForActiveBackend(marker.persistenceProfile);
    const repository = (options.createRepository ?? createActiveWaSqliteRepository)(marker.persistenceProfile);
    await repository.hydrate();
    replaceActiveVaultStorageRepository(repository);
    return true;
  } catch {
    clearPersistedActiveVaultStorageBackend();
    return false;
  }
}

function isPersistedActiveVaultStorageBackend(value: PersistedActiveVaultStorageBackend): value is PersistedActiveVaultStorageBackend {
  const profile = value?.persistenceProfile;
  return value?.version === 1
    && value.backend === 'wa-sqlite'
    && typeof value.promotedAt === 'string'
    && typeof profile?.databaseName === 'string'
    && typeof profile.storageScope === 'string'
    && profile.persistenceKind === 'indexeddb-minimal-vfs'
    && (typeof profile.vfsName === 'string' || profile.vfsName === null)
    && profile.persistentVfsReady === true
    && profile.activeBackendReady === true;
}

function createActiveWaSqliteRepository(profile: WaSqlitePersistenceProfile): VaultStorageRepository {
  return createVaultStorageRepositoryForSelection({
    active: 'wa-sqlite',
    target: null,
    mode: 'active',
  }, {
    persistenceProfile: profile,
  });
}

export interface VaultStorageRepositoryPromotionResult {
  repository: VaultStorageRepository;
  restorePreviousRepository: () => void;
}

export interface VaultStorageRepositoryPromotionOptions {
  createRepository?: (plan: WaSqliteActiveBackendPromotionPlan) => VaultStorageRepository;
}

export function promoteVaultStorageRepositoryFromPlan(
  plan: WaSqliteActiveBackendPromotionPlan,
): VaultStorageRepositoryPromotionResult {
  const repository = createVaultStorageRepositoryForPromotionPlan(plan);
  return replaceActiveVaultStorageRepository(repository);
}

function assertVaultStoragePromotionPlanReady(plan: WaSqliteActiveBackendPromotionPlan): void {
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
}

function replaceActiveVaultStorageRepository(
  repository: VaultStorageRepository,
): VaultStorageRepositoryPromotionResult {
  const previousRepository = activeVaultStorageRepository;
  activeVaultStorageRepository = repository;

  return {
    repository,
    restorePreviousRepository: () => {
      activeVaultStorageRepository = previousRepository;
    },
  };
}

export async function promoteAndHydrateVaultStorageRepositoryFromPlan(
  plan: WaSqliteActiveBackendPromotionPlan,
  options: VaultStorageRepositoryPromotionOptions = {},
): Promise<VaultStorageRepositoryPromotionResult> {
  assertVaultStoragePromotionPlanReady(plan);
  const createRepository = options.createRepository ?? createVaultStorageRepositoryForPromotionPlan;
  const repository = createRepository(plan);
  await repository.hydrate();

  return replaceActiveVaultStorageRepository(repository);
}

export interface VaultStorageActiveRepositoryOptions {
  persistenceProfile?: WaSqlitePersistenceProfile;
}

export function createVaultStorageRepositoryForPromotionPlan(
  plan: WaSqliteActiveBackendPromotionPlan,
): VaultStorageRepository {
  assertVaultStoragePromotionPlanReady(plan);

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
