/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultStorageMigrationResult } from './vaultStorageMigration';
import type { VaultStorageMigrationDryRunResult } from './vaultStorageMigrationDryRun';
import type { WaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { WaSqlitePersistenceSmokeResult } from './waSqlitePersistenceSmoke';

export type WaSqlitePromotionReadinessStatus = 'ready' | 'blocked';

export interface WaSqlitePromotionReadinessReport {
  status: WaSqlitePromotionReadinessStatus;
  issues: string[];
}

export interface WaSqlitePromotionReadinessInput {
  persistenceProfile: WaSqlitePersistenceProfile;
  smokeResult?: WaSqlitePersistenceSmokeResult | null;
  dryRunResult?: VaultStorageMigrationDryRunResult | null;
  migrationResult?: VaultStorageMigrationResult | null;
}

export function evaluateWaSqlitePromotionReadiness(
  input: WaSqlitePromotionReadinessInput,
): WaSqlitePromotionReadinessReport {
  const issues: string[] = [];
  const { persistenceProfile, smokeResult, dryRunResult, migrationResult } = input;

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
