/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getVaultStorageRepository,
  createVaultStorageMigrationRepositoryPair,
  promoteAndHydrateVaultStorageRepositoryFromPlan,
  persistWaSqliteActiveBackendPromotion,
  type VaultStorageMigrationRepositoryPair,
  type VaultStorageRepositoryPromotionResult,
} from './vaultStorageProvider';
import {
  createWaSqliteActiveBackendPromotionPlan,
  evaluateWaSqlitePromotionReadiness,
  type WaSqlitePromotionReadinessReport,
} from './waSqlitePromotionReadiness';
import type { VaultStorageRepository } from './vaultStorageRepository';
import { runVaultStorageMigrationDryRun, type VaultStorageMigrationDryRunResult } from './vaultStorageMigrationDryRun';
import {
  runWaSqlitePersistentMigrationCandidate,
  type WaSqlitePersistentMigrationCandidateResult,
} from './vaultStorageMigrationCandidate';
import {
  createWaSqlitePersistenceProfile,
  type WaSqlitePersistenceProfile,
} from './waSqlitePersistence';
import {
  verifyWaSqlitePersistentVfsSmoke,
  type WaSqlitePersistenceSmokeResult,
} from './waSqlitePersistenceSmoke';

export type WaSqliteActiveMigrationStatus = 'promoted' | 'blocked';

export interface WaSqliteActiveBackendMigrationResult {
  status: WaSqliteActiveMigrationStatus;
  issues: string[];
  readinessReport: WaSqlitePromotionReadinessReport;
  smokeResult: WaSqlitePersistenceSmokeResult;
  dryRunResult: VaultStorageMigrationDryRunResult | null;
  persistentMigrationCandidateResult: WaSqlitePersistentMigrationCandidateResult | null;
  promotionResult: VaultStorageRepositoryPromotionResult | null;
}

export interface WaSqliteActiveBackendMigrationOptions {
  sourceRepository?: VaultStorageRepository;
  persistenceProfile?: WaSqlitePersistenceProfile;
  migrationPair?: VaultStorageMigrationRepositoryPair;
  createMigrationPair?: () => VaultStorageMigrationRepositoryPair;
  verifyPersistentTarget?: () => Promise<WaSqlitePersistenceSmokeResult>;
  promoteRepository?: typeof promoteAndHydrateVaultStorageRepositoryFromPlan;
  persistPromotion?: typeof persistWaSqliteActiveBackendPromotion;
}

export async function runWaSqliteActiveBackendMigration(
  masterPasswordPlain: string,
  options: WaSqliteActiveBackendMigrationOptions = {},
): Promise<WaSqliteActiveBackendMigrationResult> {
  const sourceRepository = options.sourceRepository ?? getVaultStorageRepository();
  const requestedPersistenceProfile = options.persistenceProfile ?? createWaSqlitePersistenceProfile();
  const migrationPair = options.migrationPair ?? (
    options.createMigrationPair ?? (() => createVaultStorageMigrationRepositoryPair('wa-sqlite', {
      persistenceProfile: requestedPersistenceProfile,
    }))
  )();
  const persistenceProfile = options.persistenceProfile ?? migrationPair.persistenceProfile;
  const verifyPersistentTarget = options.verifyPersistentTarget ?? (
    () => verifyWaSqlitePersistentVfsSmoke({ persistenceProfile })
  );
  const smokeResult = await verifyPersistentTarget();
  let persistentMigrationCandidateResult: WaSqlitePersistentMigrationCandidateResult | null = null;
  let dryRunResult: VaultStorageMigrationDryRunResult | null = null;

  if (smokeResult.status === 'passed') {
    persistentMigrationCandidateResult = await runWaSqlitePersistentMigrationCandidate(masterPasswordPlain, {
      sourceRepository,
      migrationPair,
      verifyPersistentTarget: () => Promise.resolve(smokeResult),
    });

    if (persistentMigrationCandidateResult.migrationResult.status === 'migrated') {
      const reopenedTargetRepository = migrationPair.reopenTargetRepository();
      dryRunResult = await runVaultStorageMigrationDryRun(
        sourceRepository,
        {
          active: 'opfs',
          target: 'wa-sqlite',
          mode: 'dry-run',
        },
        masterPasswordPlain,
        reopenedTargetRepository,
      );
    }
  }

  const readinessInput = {
    persistenceProfile,
    smokeResult,
    dryRunResult,
    persistentMigrationCandidateResult,
  };
  const readinessReport = evaluateWaSqlitePromotionReadiness(readinessInput);

  if (readinessReport.status !== 'ready') {
    return {
      status: 'blocked',
      issues: readinessReport.issues,
      readinessReport,
      smokeResult,
      dryRunResult,
      persistentMigrationCandidateResult,
      promotionResult: null,
    };
  }

  const promotionPlan = createWaSqliteActiveBackendPromotionPlan(readinessInput);
  let promotionResult: VaultStorageRepositoryPromotionResult;

  try {
    promotionResult = await (options.promoteRepository ?? promoteAndHydrateVaultStorageRepositoryFromPlan)(
      promotionPlan,
    );
  } catch (error) {
    return {
      status: 'blocked',
      issues: [activeMigrationIssueFromError(error, 'wa-sqlite-active-backend-promotion-failed')],
      readinessReport,
      smokeResult,
      dryRunResult,
      persistentMigrationCandidateResult,
      promotionResult: null,
    };
  }

  try {
    (options.persistPromotion ?? persistWaSqliteActiveBackendPromotion)(promotionPlan);
  } catch {
    promotionResult.restorePreviousRepository();
    return {
      status: 'blocked',
      issues: ['wa-sqlite-active-backend-marker-write-failed'],
      readinessReport,
      smokeResult,
      dryRunResult,
      persistentMigrationCandidateResult,
      promotionResult: null,
    };
  }

  return {
    status: 'promoted',
    issues: [],
    readinessReport,
    smokeResult,
    dryRunResult,
    persistentMigrationCandidateResult,
    promotionResult,
  };
}

function activeMigrationIssueFromError(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error ? error.message : String(error || fallback);
  const sanitizedMessage = rawMessage
    .replace(/[\r\n\t]/g, ' ')
    .replace(/<script/gi, '&lt;script')
    .replace(/[<>]/g, '_')
    .trim()
    .slice(0, 160);

  return sanitizedMessage || fallback;
}
