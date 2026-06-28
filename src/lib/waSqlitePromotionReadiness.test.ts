/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  createWaSqliteActiveBackendPromotionPlan,
  createWaSqliteActivePersistenceProfileFromReadiness,
  evaluateWaSqlitePromotionReadiness,
  WaSqlitePromotionReadinessError,
} from './waSqlitePromotionReadiness';
import { createWaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { VaultStorageMigrationResult } from './vaultStorageMigration';
import type { WaSqlitePersistentMigrationCandidateResult } from './vaultStorageMigrationCandidate';
import type { VaultStorageMigrationDryRunResult } from './vaultStorageMigrationDryRun';
import type { WaSqlitePersistenceSmokeResult } from './waSqlitePersistenceSmoke';

const passedSmoke: WaSqlitePersistenceSmokeResult = {
  status: 'passed',
  databaseName: '/aegis-wa-sqlite.test.db',
  vfsName: 'aegis-wa-sqlite-test-idb',
};

const readyDryRun: VaultStorageMigrationDryRunResult = {
  status: 'ready',
  sourceBackend: 'opfs',
  targetBackend: 'wa-sqlite',
  itemCount: 2,
  targetItemCount: 2,
  issues: [],
};

const persistentProfile = createWaSqlitePersistenceProfile('desktop-app-data', true);

const migrated: VaultStorageMigrationResult = {
  status: 'migrated',
  sourceBackend: 'opfs',
  targetBackend: 'wa-sqlite',
  itemCount: 2,
  targetItemCount: 2,
  issues: [],
};

const migratedCandidate: WaSqlitePersistentMigrationCandidateResult = {
  migrationResult: migrated,
  persistenceProfile: persistentProfile,
};

describe('wa-sqlite promotion readiness', () => {
  it('creates an active backend promotion plan only after every wa-sqlite gate is ready', () => {
    const plan = createWaSqliteActiveBackendPromotionPlan({
      persistenceProfile: persistentProfile,
      smokeResult: passedSmoke,
      dryRunResult: readyDryRun,
      persistentMigrationCandidateResult: migratedCandidate,
    });

    expect(plan).toEqual({
      selection: {
        active: 'wa-sqlite',
        target: null,
        mode: 'active',
      },
      persistenceProfile: {
        ...persistentProfile,
        activeBackendReady: true,
        blocker: '',
      },
      readinessReport: {
        status: 'ready',
        issues: [],
      },
    });
  });

  it('does not create an active backend promotion plan for blocked readiness evidence', () => {
    expect(() => createWaSqliteActiveBackendPromotionPlan({
      persistenceProfile: persistentProfile,
      smokeResult: passedSmoke,
      dryRunResult: readyDryRun,
      migrationResult: migrated,
    })).toThrow(WaSqlitePromotionReadinessError);
  });

  it('promotes only the verified persistent migration candidate profile for active backend use', () => {
    const activeProfile = createWaSqliteActivePersistenceProfileFromReadiness({
      persistenceProfile: persistentProfile,
      smokeResult: passedSmoke,
      dryRunResult: readyDryRun,
      persistentMigrationCandidateResult: migratedCandidate,
    });

    expect(activeProfile).toEqual({
      ...persistentProfile,
      activeBackendReady: true,
      blocker: '',
    });
  });

  it('refuses to create an active wa-sqlite profile while readiness is blocked', () => {
    expect(() => createWaSqliteActivePersistenceProfileFromReadiness({
      persistenceProfile: persistentProfile,
      smokeResult: passedSmoke,
      dryRunResult: readyDryRun,
      migrationResult: migrated,
    })).toThrow(WaSqlitePromotionReadinessError);

    try {
      createWaSqliteActivePersistenceProfileFromReadiness({
        persistenceProfile: persistentProfile,
        smokeResult: passedSmoke,
        dryRunResult: readyDryRun,
        migrationResult: migrated,
      });
      throw new Error('expected active profile promotion to fail');
    } catch (error) {
      expect((error as WaSqlitePromotionReadinessError).issues).toEqual([
        'wa-sqlite-promotion-persistent-migration-candidate-not-run',
      ]);
    }
  });

  it('reports ready only when persistent VFS, smoke, dry-run, and migration all passed', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: persistentProfile,
      smokeResult: passedSmoke,
      dryRunResult: readyDryRun,
      persistentMigrationCandidateResult: migratedCandidate,
    })).toEqual({
      status: 'ready',
      issues: [],
    });
  });

  it('blocks promotion when required checks have not run yet', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', true),
    })).toEqual({
      status: 'blocked',
      issues: [
        'wa-sqlite-promotion-smoke-not-run',
        'wa-sqlite-promotion-dry-run-not-run',
        'wa-sqlite-promotion-persistent-migration-candidate-not-run',
        'wa-sqlite-promotion-migration-not-run',
      ],
    });
  });

  it('surfaces persistent VFS and smoke failures without duplicating issue codes', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', false),
      smokeResult: {
        status: 'failed',
        databaseName: '/aegis-wa-sqlite.test.db',
        vfsName: null,
        issue: 'wa-sqlite-persistent-vfs-unavailable',
      },
      dryRunResult: readyDryRun,
      persistentMigrationCandidateResult: migratedCandidate,
    })).toEqual({
      status: 'blocked',
      issues: [
        'wa-sqlite-persistent-vfs-unavailable',
        'wa-sqlite-promotion-smoke-failed',
      ],
    });
  });

  it('carries dry-run and migration blocker details into the report', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: createWaSqlitePersistenceProfile('android-app-private', true),
      smokeResult: passedSmoke,
      dryRunResult: {
        ...readyDryRun,
        status: 'blocked',
        issues: ['vault-storage-dry-run-target-count-mismatch'],
      },
      persistentMigrationCandidateResult: {
        migrationResult: {
          ...migrated,
          status: 'rolled-back',
          issues: ['vault-storage-migration-target-content-mismatch'],
        },
        persistenceProfile: createWaSqlitePersistenceProfile('android-app-private', true),
      },
    })).toEqual({
      status: 'blocked',
      issues: [
        'wa-sqlite-promotion-dry-run-not-ready',
        'vault-storage-dry-run-target-count-mismatch',
        'wa-sqlite-promotion-migration-not-migrated',
        'vault-storage-migration-target-content-mismatch',
      ],
    });
  });

  it('blocks promotion when only legacy migration evidence is provided without a persistent candidate', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: persistentProfile,
      smokeResult: passedSmoke,
      dryRunResult: readyDryRun,
      migrationResult: migrated,
    })).toEqual({
      status: 'blocked',
      issues: ['wa-sqlite-promotion-persistent-migration-candidate-not-run'],
    });
  });

  it('blocks promotion when the persistent candidate was created for a different storage profile', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: persistentProfile,
      smokeResult: passedSmoke,
      dryRunResult: readyDryRun,
      persistentMigrationCandidateResult: {
        migrationResult: migrated,
        persistenceProfile: createWaSqlitePersistenceProfile('android-app-private', true),
      },
    })).toEqual({
      status: 'blocked',
      issues: [
        'wa-sqlite-promotion-candidate-database-mismatch',
        'wa-sqlite-promotion-candidate-storage-scope-mismatch',
        'wa-sqlite-promotion-candidate-vfs-mismatch',
      ],
    });
  });

  it('blocks promotion when dry-run or migration results point at the wrong backend', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', true),
      smokeResult: passedSmoke,
      dryRunResult: {
        ...readyDryRun,
        targetBackend: null,
      },
      persistentMigrationCandidateResult: {
        migrationResult: {
          ...migrated,
          sourceBackend: 'wa-sqlite',
          targetBackend: 'opfs',
        },
        persistenceProfile: persistentProfile,
      },
    })).toEqual({
      status: 'blocked',
      issues: [
        'wa-sqlite-promotion-dry-run-target-backend-mismatch',
        'wa-sqlite-promotion-migration-source-backend-mismatch',
        'wa-sqlite-promotion-migration-target-backend-mismatch',
      ],
    });
  });

  it('blocks promotion when dry-run and migration item counts diverge', () => {
    expect(evaluateWaSqlitePromotionReadiness({
      persistenceProfile: createWaSqlitePersistenceProfile('desktop-app-data', true),
      smokeResult: passedSmoke,
      dryRunResult: {
        ...readyDryRun,
        itemCount: 3,
        targetItemCount: 3,
      },
      persistentMigrationCandidateResult: {
        migrationResult: {
          ...migrated,
          itemCount: 2,
          targetItemCount: 1,
        },
        persistenceProfile: persistentProfile,
      },
    })).toEqual({
      status: 'blocked',
      issues: [
        'wa-sqlite-promotion-migration-count-mismatch',
        'wa-sqlite-promotion-source-count-changed-after-dry-run',
        'wa-sqlite-promotion-target-count-changed-after-dry-run',
      ],
    });
  });
});
