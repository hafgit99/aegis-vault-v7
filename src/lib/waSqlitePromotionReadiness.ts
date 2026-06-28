/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  parseVaultStorageBackendSelection,
  type VaultStorageBackendSelection,
} from './vaultStorageBackend';
import type { VaultStorageMigrationResult } from './vaultStorageMigration';
import type { WaSqlitePersistentMigrationCandidateResult } from './vaultStorageMigrationCandidate';
import type { VaultStorageMigrationDryRunResult } from './vaultStorageMigrationDryRun';
import {
  markWaSqlitePersistenceReadyForActiveBackend,
  type WaSqlitePersistenceProfile,
} from './waSqlitePersistence';
import type { WaSqlitePersistenceSmokeResult } from './waSqlitePersistenceSmoke';

export type WaSqlitePromotionReadinessStatus = 'ready' | 'blocked';

export interface WaSqlitePromotionReadinessReport {
  status: WaSqlitePromotionReadinessStatus;
  issues: string[];
}

export class WaSqlitePromotionReadinessError extends Error {
  constructor(public readonly issues: string[]) {
    super('wa-sqlite-promotion-not-ready');
    this.name = 'WaSqlitePromotionReadinessError';
  }
}

export interface WaSqlitePromotionReadinessInput {
  persistenceProfile: WaSqlitePersistenceProfile;
  smokeResult?: WaSqlitePersistenceSmokeResult | null;
  dryRunResult?: VaultStorageMigrationDryRunResult | null;
  migrationResult?: VaultStorageMigrationResult | null;
  persistentMigrationCandidateResult?: WaSqlitePersistentMigrationCandidateResult | null;
}

export interface WaSqliteActiveBackendPromotionPlan {
  selection: VaultStorageBackendSelection;
  persistenceProfile: WaSqlitePersistenceProfile;
  readinessReport: WaSqlitePromotionReadinessReport;
}

export function evaluateWaSqlitePromotionReadiness(
  input: WaSqlitePromotionReadinessInput,
): WaSqlitePromotionReadinessReport {
  const issues: string[] = [];
  const { persistenceProfile, smokeResult, dryRunResult, persistentMigrationCandidateResult } = input;
  const migrationResult = persistentMigrationCandidateResult?.migrationResult ?? input.migrationResult;

  if (!persistenceProfile.persistentVfsReady) {
    issues.push(persistenceProfile.blocker || 'wa-sqlite-persistent-vfs-unavailable');
  }

  if (!smokeResult) {
    issues.push('wa-sqlite-promotion-smoke-not-run');
  } else if (smokeResult.status !== 'passed') {
    issues.push('wa-sqlite-promotion-smoke-failed');
    if (smokeResult.issue) {
      issues.push(smokeResult.issue);
    }
  }

  if (!dryRunResult) {
    issues.push('wa-sqlite-promotion-dry-run-not-run');
  } else {
    if (dryRunResult.status !== 'ready') {
      issues.push('wa-sqlite-promotion-dry-run-not-ready', ...dryRunResult.issues);
    }
    validateDryRunResult(dryRunResult, issues);
  }

  if (!persistentMigrationCandidateResult) {
    issues.push('wa-sqlite-promotion-persistent-migration-candidate-not-run');
  } else if (persistenceProfile.persistentVfsReady) {
    validatePersistentMigrationCandidateProfile(
      persistenceProfile,
      persistentMigrationCandidateResult.persistenceProfile,
      issues,
    );
  }

  if (!migrationResult) {
    issues.push('wa-sqlite-promotion-migration-not-run');
  } else {
    if (migrationResult.status !== 'migrated') {
      issues.push('wa-sqlite-promotion-migration-not-migrated', ...migrationResult.issues);
    }
    validateMigrationResult(migrationResult, issues);
  }

  if (dryRunResult && migrationResult) {
    validateReadinessResultParity(dryRunResult, migrationResult, issues);
  }

  return {
    status: issues.length === 0 ? 'ready' : 'blocked',
    issues: Array.from(new Set(issues)),
  };
}

export function createWaSqliteActivePersistenceProfileFromReadiness(
  input: WaSqlitePromotionReadinessInput,
): WaSqlitePersistenceProfile {
  const report = evaluateWaSqlitePromotionReadiness(input);
  if (report.status !== 'ready') {
    throw new WaSqlitePromotionReadinessError(report.issues);
  }

  const promotedProfile = input.persistentMigrationCandidateResult?.persistenceProfile
    ?? input.persistenceProfile;
  return markWaSqlitePersistenceReadyForActiveBackend(promotedProfile);
}

export function createWaSqliteActiveBackendPromotionPlan(
  input: WaSqlitePromotionReadinessInput,
): WaSqliteActiveBackendPromotionPlan {
  const readinessReport = evaluateWaSqlitePromotionReadiness(input);
  if (readinessReport.status !== 'ready') {
    throw new WaSqlitePromotionReadinessError(readinessReport.issues);
  }

  const persistenceProfile = createWaSqliteActivePersistenceProfileFromReadiness(input);
  const selection = parseVaultStorageBackendSelection('wa-sqlite', {
    waSqlitePromotionReadiness: readinessReport,
    activeWaSqliteProviderEnabled: true,
  });

  return {
    selection,
    persistenceProfile,
    readinessReport,
  };
}

function validatePersistentMigrationCandidateProfile(
  expectedProfile: WaSqlitePersistenceProfile,
  candidateProfile: WaSqlitePersistenceProfile,
  issues: string[],
): void {
  if (candidateProfile.databaseName !== expectedProfile.databaseName) {
    issues.push('wa-sqlite-promotion-candidate-database-mismatch');
  }
  if (candidateProfile.storageScope !== expectedProfile.storageScope) {
    issues.push('wa-sqlite-promotion-candidate-storage-scope-mismatch');
  }
  if (candidateProfile.vfsName !== expectedProfile.vfsName) {
    issues.push('wa-sqlite-promotion-candidate-vfs-mismatch');
  }
}

function validateDryRunResult(result: VaultStorageMigrationDryRunResult, issues: string[]): void {
  if (result.sourceBackend !== 'opfs') {
    issues.push('wa-sqlite-promotion-dry-run-source-backend-mismatch');
  }
  if (result.targetBackend !== 'wa-sqlite') {
    issues.push('wa-sqlite-promotion-dry-run-target-backend-mismatch');
  }
  if (result.itemCount !== result.targetItemCount) {
    issues.push('wa-sqlite-promotion-dry-run-count-mismatch');
  }
}

function validateMigrationResult(result: VaultStorageMigrationResult, issues: string[]): void {
  if (result.sourceBackend !== 'opfs') {
    issues.push('wa-sqlite-promotion-migration-source-backend-mismatch');
  }
  if (result.targetBackend !== 'wa-sqlite') {
    issues.push('wa-sqlite-promotion-migration-target-backend-mismatch');
  }
  if (result.itemCount !== result.targetItemCount) {
    issues.push('wa-sqlite-promotion-migration-count-mismatch');
  }
}

function validateReadinessResultParity(
  dryRunResult: VaultStorageMigrationDryRunResult,
  migrationResult: VaultStorageMigrationResult,
  issues: string[],
): void {
  if (dryRunResult.itemCount !== migrationResult.itemCount) {
    issues.push('wa-sqlite-promotion-source-count-changed-after-dry-run');
  }
  if (dryRunResult.targetItemCount !== migrationResult.targetItemCount) {
    issues.push('wa-sqlite-promotion-target-count-changed-after-dry-run');
  }
}
