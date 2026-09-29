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

export const ACTIVE_VAULT_STORAGE_BACKEND_KEY = 'KalderaShield_vault_storage_active_backend';

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

/**
 * Y-13: the outcome of restoring a persisted wa-sqlite backend.
 *
 * The old contract was a bare `boolean`, which forced every failure into one
 * indistinguishable bucket and, worse, into a single `catch` that always
 * deleted the promotion marker. That is what made a recoverable failure
 * irreversible.
 */
export type VaultStorageRestoreOutcome =
  /** The persisted wa-sqlite backend was reopened and made active. */
  | { status: 'restored' }
  /** No promotion marker exists. A fresh backend may legitimately be created. */
  | { status: 'absent' }
  /**
   * A promotion marker exists but the database could not be opened *right now*.
   *
   * The wa-sqlite database is still intact and is still referenced by the
   * marker. Clearing the marker here would orphan the user's only vault, so
   * callers must treat this as a retryable "storage unavailable" state and must
   * NOT create a replacement vault.
   */
  | { status: 'unavailable'; reason: string; error: unknown };

function vaultStorageRestoreReason(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  return raw.replace(/[\r\n\t]+/g, ' ').trim() || 'vault-storage-backend-unavailable';
}

export async function restorePersistedActiveVaultStorageBackend(
  options: RestorePersistedVaultStorageBackendOptions = {},
): Promise<VaultStorageRestoreOutcome> {
  const marker = readPersistedActiveVaultStorageBackend();
  if (!marker) return { status: 'absent' };

  try {
    assertWaSqlitePersistenceReadyForActiveBackend(marker.persistenceProfile);
    const repository = (options.createRepository ?? createActiveWaSqliteRepository)(marker.persistenceProfile);
    await repository.hydrate();
    replaceActiveVaultStorageRepository(repository, {
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    });
    return { status: 'restored' };
  } catch (error) {
    // Y-13: the marker is deliberately PRESERVED.
    //
    // Reaching this point means the marker already passed
    // `isPersistedActiveVaultStorageBackend`, which is the one place a
    // genuinely incompatible marker (wrong version, wrong VFS name, unsupported
    // storage scope) is legitimately discarded — it does that itself, on read,
    // and returns null. So there is no remaining case here where deleting the
    // marker is the right move:
    //
    //  - `assertWaSqlitePersistenceReadyForActiveBackend` throws only when
    //    IndexedDB is currently unavailable. The marker is still valid; the
    //    environment is broken. Transient.
    //  - `hydrate()` throws for a transient reason: a WASM/indexedDB fetch 500,
    //    `QuotaExceededError` when snapshots have filled the origin quota, or a
    //    tab-restore race.
    //
    // Previously both paths fell into one `catch` that called
    // `clearPersistedActiveVaultStorageBackend()`. The wa-sqlite database then
    // had no remaining reference anywhere in the app, and
    // `restoreOrActivateDefaultVaultStorageBackend` went on to create a brand
    // new *empty* database and return `activated-wa-sqlite-default`. The user's
    // vault silently vanished with no error shown.
    return { status: 'unavailable', reason: vaultStorageRestoreReason(error), error };
  }
}

/**
 * Y-13: `wa-sqlite-unavailable` means a promotion marker exists but its database
 * could not be opened on this attempt. The caller must surface this as a
 * retryable failure — it must NOT be treated as "no vault exists" and must NOT
 * be allowed to create a replacement vault.
 */
export type VaultStorageStartupBackendStatus =
  | 'restored-wa-sqlite'
  | 'activated-wa-sqlite-default'
  | 'kept-legacy-opfs'
  | 'kept-opfs-fallback'
  | 'wa-sqlite-unavailable';

export interface RestoreOrActivateDefaultVaultStorageBackendOptions extends RestorePersistedVaultStorageBackendOptions {
  hasLegacyOpfsVaultData?: () => boolean;
  createPersistenceProfile?: () => WaSqlitePersistenceProfile;
}

export async function restoreOrActivateDefaultVaultStorageBackend(
  options: RestoreOrActivateDefaultVaultStorageBackendOptions = {},
): Promise<VaultStorageStartupBackendStatus> {
  const restored = await restorePersistedActiveVaultStorageBackend(options);
  if (restored.status === 'restored') {
    return 'restored-wa-sqlite';
  }

  // Y-13: fail closed. A promotion marker exists, so the user's vault lives in
  // a wa-sqlite database. It failed to open this time, but it is still there.
  // Falling through to the activation branch below would create a brand new,
  // empty database, overwrite the marker with a fresh promotion record, and
  // present that empty vault as `activated-wa-sqlite-default` — permanent,
  // silent data loss.
  if (restored.status === 'unavailable') {
    return 'wa-sqlite-unavailable';
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
  if (getIndexedDbItemSync('KalderaShield_is_setup') === 'true') return true;

  const fallback = getIndexedDbItemSync('kalderashield_fallback');
  if (!fallback) return false;

  try {
    const parsed = JSON.parse(fallback) as { user_secrets?: unknown[] };
    return Array.isArray(parsed.user_secrets) && parsed.user_secrets.length > 0;
  } catch {
    return true;
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
