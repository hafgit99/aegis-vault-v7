/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultStorageBackendKind } from './vaultStorageBackend';
import {
  createVaultStorageMigrationRepositoryPair,
  getVaultStorageRepository,
  type VaultStorageMigrationRepositoryPair,
} from './vaultStorageProvider';
import {
  runVaultStorageMigration,
  type VaultStorageMigrationResult,
} from './vaultStorageMigration';
import type { VaultStorageRepository } from './vaultStorageRepository';
import type { WaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { WaSqlitePersistenceSmokeResult } from './waSqlitePersistenceSmoke';

export interface WaSqlitePersistentMigrationCandidateOptions {
  sourceRepository?: VaultStorageRepository;
  sourceBackend?: VaultStorageBackendKind;
  targetBackend?: VaultStorageBackendKind;
  migrationPair?: VaultStorageMigrationRepositoryPair;
  createMigrationPair?: () => VaultStorageMigrationRepositoryPair;
  verifyPersistentTarget?: () => Promise<WaSqlitePersistenceSmokeResult>;
}

export interface WaSqlitePersistentMigrationCandidateResult {
  migrationResult: VaultStorageMigrationResult;
  persistenceProfile: WaSqlitePersistenceProfile;
}

export async function runWaSqlitePersistentMigrationCandidate(
  masterPasswordPlain: string,
  options: WaSqlitePersistentMigrationCandidateOptions = {},
): Promise<WaSqlitePersistentMigrationCandidateResult> {
  const sourceRepository = options.sourceRepository ?? getVaultStorageRepository();
  const migrationPair = options.migrationPair ?? (
    options.createMigrationPair ?? (() => createVaultStorageMigrationRepositoryPair('wa-sqlite'))
  )();

  const migrationResult = await runVaultStorageMigration(
    sourceRepository,
    migrationPair.targetRepository,
    masterPasswordPlain,
    options.sourceBackend ?? 'opfs',
    options.targetBackend ?? 'wa-sqlite',
    {
      verifyPersistentTarget: options.verifyPersistentTarget,
      reopenTargetRepository: migrationPair.reopenTargetRepository,
    },
  );

  return {
    migrationResult,
    persistenceProfile: migrationPair.persistenceProfile,
  };
}
