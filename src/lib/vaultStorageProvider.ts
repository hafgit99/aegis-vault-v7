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
  markWaSqlitePersistenceReadyForActiveBackend,
  type WaSqlitePersistenceProfile,
} from './waSqlitePersistence';
import { createWaSqliteVaultStorageRepository } from './waSqliteVaultStorageRepository';
import { getIndexedDbItemSync, setIndexedDbItemSync, removeIndexedDbItemSync } from './indexedDbStorage';
import { isDesktopRuntime } from './desktopStorage';

export const ACTIVE_VAULT_STORAGE_BACKEND_KEY = 'aegis_vault_storage_active_backend';

const SUPPORTED_WA_SQLITE_STORAGE_SCOPES = new Set([
  'android-app-private',
  'desktop-app-data',
  'browser-fallback',
]);

interface PersistedActiveVaultStorageBackend {
  version: 1;
  backend: 'wa-sqlite';
  persistenceProfile: WaSqlitePersistenceProfile;
  promotedAt: string;
}

let activeVaultStorageRepository: VaultStorageRepository = sqliteOPFSInstance;
let activeVaultStorageBackendSelection: VaultStorageBackendSelection = {
  active: 'opfs',
  target: null,
  mode: 'active',
};

export function getVaultStorageRepository(): VaultStorageRepository {
  return activeVaultStorageRepository;
}

export function getActiveVaultStorageBackendSelection() {
  return { ...activeVaultStorageBackendSelection };
}

export function clearPersistedActiveVaultStorageBackend(): void {
  removeIndexedDbItemSync(ACTIVE_VAULT_STORAGE_BACKEND_KEY);
}

export function persistWaSqliteActiveBackendPromotion(plan: WaSqliteActiveBackendPromotionPlan): void {
  assertVaultStoragePromotionPlanReady(plan);
  assertWaSqlitePersistenceReadyForActiveBackend(plan.persistenceProfile);

  const marker: PersistedActiveVaultStorageBackend = {
    version: 1,
    backend: 'wa-sqlite',
    persistenceProfile: plan.persistenceProfile,
    promotedAt: new Date().toISOString(),
  };
  setIndexedDbItemSync(ACTIVE_VAULT_STORAGE_BACKEND_KEY, JSON.stringify(marker));
}

export function readPersistedActiveVaultStorageBackend(): PersistedActiveVaultStorageBackend | null {
  const raw = getIndexedDbItemSync(ACTIVE_VAULT_STORAGE_BACKEND_KEY);
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

export type VaultStorageStartupBackendStatus = 'restored-wa-sqlite' | 'activated-wa-sqlite-default' | 'kept-legacy-opfs' | 'kept-opfs-fallback';

export interface RestoreOrActivateDefaultVaultStorageBackendOptions extends RestorePersistedVaultStorageBackendOptions {
  hasLegacyOpfsVaultData?: () => boolean;
  createPersistenceProfile?: () => WaSqlitePersistenceProfile;
}

export async function restoreOrActivateDefaultVaultStorageBackend(
  options: RestoreOrActivateDefaultVaultStorageBackendOptions = {},
): Promise<VaultStorageStartupBackendStatus> {
  if (await restorePersistedActiveVaultStorageBackend(options)) {
    return 'restored-wa-sqlite';
  }

  const hasLegacyData = (options.hasLegacyOpfsVaultData ?? hasLegacyOpfsVaultData)();
  const isDesktop = isDesktopRuntime();
  if (hasLegacyData || isDesktop) {
    return 'kept-legacy-opfs';
  }

  const profile = markWaSqlitePersistenceReadyForActiveBackend(
    (options.createPersistenceProfile ?? createWaSqlitePersistenceProfile)(),
  );

  try {
    assertWaSqlitePersistenceReadyForActiveBackend(profile);
    const repository = (options.createRepository ?? createActiveWaSqliteRepository)(profile);
    await repository.hydrate();
    persistWaSqliteDefaultActiveBackend(profile);
    replaceActiveVaultStorageRepository(repository, {
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    });
    return 'activated-wa-sqlite-default';
  } catch {
    clearPersistedActiveVaultStorageBackend();
    return 'kept-opfs-fallback';
  }
}

function persistWaSqliteDefaultActiveBackend(profile: WaSqlitePersistenceProfile): void {
  assertWaSqlitePersistenceReadyForActiveBackend(profile);

  const marker: PersistedActiveVaultStorageBackend = {
    version: 1,
    backend: 'wa-sqlite',
    persistenceProfile: profile,
    promotedAt: new Date().toISOString(),
  };
  setIndexedDbItemSync(ACTIVE_VAULT_STORAGE_BACKEND_KEY, JSON.stringify(marker));
}

function hasLegacyOpfsVaultData(): boolean {
  if (getIndexedDbItemSync('aegis_is_setup') === 'true') return true;

  const fallback = getIndexedDbItemSync('aegis_sqlite_fallback');
  if (!fallback) return false;

  try {
    const parsed = JSON.parse(fallback) as { user_secrets?: unknown[] };
    return Array.isArray(parsed.user_secrets) && parsed.user_secrets.length > 0;
  } catch {
    return true;
  }
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
    replaceActiveVaultStorageRepository(repository, {
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    });
    return true;
  } catch {
    clearPersistedActiveVaultStorageBackend();
    return false;
  }
}

function isPersistedActiveVaultStorageBackend(value: PersistedActiveVaultStorageBackend): value is PersistedActiveVaultStorageBackend {
  const profile = value?.persistenceProfile;
  if (
    value?.version !== 1
    || value.backend !== 'wa-sqlite'
    || typeof value.promotedAt !== 'string'
    || typeof profile?.databaseName !== 'string'
    || !SUPPORTED_WA_SQLITE_STORAGE_SCOPES.has(profile.storageScope)
    || profile.persistenceKind !== 'indexeddb-minimal-vfs'
    || typeof profile.vfsName !== 'string'
    || profile.vfsName.length === 0
    || profile.persistentVfsReady !== true
    || profile.activeBackendReady !== true
  ) {
    return false;
  }

  const expectedProfile = createWaSqlitePersistenceProfile(profile.storageScope, true);
  return profile.databaseName === expectedProfile.databaseName
    && profile.vfsName === expectedProfile.vfsName;
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
  return replaceActiveVaultStorageRepository(repository, plan.selection);
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
  selection: VaultStorageBackendSelection = activeVaultStorageBackendSelection,
): VaultStorageRepositoryPromotionResult {
  const previousRepository = activeVaultStorageRepository;
  const previousSelection = activeVaultStorageBackendSelection;
  activeVaultStorageRepository = repository;
  activeVaultStorageBackendSelection = { ...selection };

  return {
    repository,
    restorePreviousRepository: () => {
      activeVaultStorageRepository = previousRepository;
      activeVaultStorageBackendSelection = previousSelection;
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

  return replaceActiveVaultStorageRepository(repository, plan.selection);
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

export function setVaultStorageRepositoryForTesting(
  repository: VaultStorageRepository,
  selection: VaultStorageBackendSelection = {
    active: 'opfs',
    target: null,
    mode: 'active',
  },
): () => void {
  const previousRepository = activeVaultStorageRepository;
  const previousSelection = activeVaultStorageBackendSelection;
  activeVaultStorageRepository = repository;
  activeVaultStorageBackendSelection = { ...selection };

  return () => {
    activeVaultStorageRepository = previousRepository;
    activeVaultStorageBackendSelection = previousSelection;
  };
}
