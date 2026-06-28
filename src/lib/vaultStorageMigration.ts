/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import type { VaultStorageBackendKind } from './vaultStorageBackend';
import type { VaultStorageRepository } from './vaultStorageRepository';
import {
  verifyWaSqlitePersistentVfsSmoke,
  type WaSqlitePersistenceSmokeResult,
} from './waSqlitePersistenceSmoke';

export type VaultStorageMigrationStatus = 'migrated' | 'blocked' | 'rolled-back';

export interface VaultStorageMigrationResult {
  status: VaultStorageMigrationStatus;
  sourceBackend: VaultStorageBackendKind;
  targetBackend: VaultStorageBackendKind;
  itemCount: number;
  targetItemCount: number;
  issues: string[];
}

interface VaultStorageMigrationOptions {
  verifyPersistentTarget?: () => Promise<WaSqlitePersistenceSmokeResult>;
  reopenTargetRepository?: () => VaultStorageRepository | Promise<VaultStorageRepository>;
}

export async function runVaultStorageMigration(
  sourceRepository: VaultStorageRepository,
  targetRepository: VaultStorageRepository,
  masterPasswordPlain: string,
  sourceBackend: VaultStorageBackendKind = 'opfs',
  targetBackend: VaultStorageBackendKind = 'wa-sqlite',
  options: VaultStorageMigrationOptions = {},
): Promise<VaultStorageMigrationResult> {
  const issues: string[] = [];

  await sourceRepository.hydrate();
  const sourcePasswordValid = await sourceRepository.verifyPassword(masterPasswordPlain);
  if (!sourcePasswordValid) {
    return blocked(sourceBackend, targetBackend, ['vault-storage-migration-invalid-source-password']);
  }

  const sourceItems = await sourceRepository.getVaultItems(masterPasswordPlain);
  const sourceIds = collectUniqueItemIds(sourceItems, issues, 'source');
  if (issues.length > 0) {
    return {
      status: 'blocked',
      sourceBackend,
      targetBackend,
      itemCount: sourceItems.length,
      targetItemCount: 0,
      issues,
    };
  }

  if (targetBackend === 'wa-sqlite') {
    const smokeResult = await (options.verifyPersistentTarget ?? verifyWaSqlitePersistentVfsSmoke)();
    if (smokeResult.status !== 'passed') {
      return {
        status: 'blocked',
        sourceBackend,
        targetBackend,
        itemCount: sourceItems.length,
        targetItemCount: 0,
        issues: [
          'vault-storage-migration-persistent-target-smoke-failed',
          smokeResult.issue ?? 'wa-sqlite-persistence-smoke-failed',
        ],
      };
    }
  }

  try {
    await targetRepository.hydrate();
    await targetRepository.resetAll();
    await targetRepository.setupMaster(masterPasswordPlain);
    const migratedItems = await targetRepository.saveVaultItems(
      sourceItems.map((item) => ({ ...item })),
      masterPasswordPlain,
    );
    const targetItems = await targetRepository.getVaultItems(masterPasswordPlain);
    validateMigratedItems(sourceItems, sourceIds, targetItems, issues);

    if (issues.length === 0 && options.reopenTargetRepository) {
      const reopenedTargetItems = await verifyReopenedTargetRepository(
        options.reopenTargetRepository,
        masterPasswordPlain,
        sourceItems,
        sourceIds,
        issues,
      );

      if (reopenedTargetItems) {
        targetItems.splice(0, targetItems.length, ...reopenedTargetItems);
      }
    }

    if (issues.length > 0) {
      await rollbackTarget(targetRepository, issues);
      return {
        status: 'rolled-back',
        sourceBackend,
        targetBackend,
        itemCount: sourceItems.length,
        targetItemCount: targetItems.length,
        issues,
      };
    }

    return {
      status: 'migrated',
      sourceBackend,
      targetBackend,
      itemCount: sourceItems.length,
      targetItemCount: migratedItems.length,
      issues: [],
    };
  } catch (error) {
    issues.push(migrationIssueFromError(error, 'vault-storage-migration-target-write-failed'));
    await rollbackTarget(targetRepository, issues);
    return {
      status: 'rolled-back',
      sourceBackend,
      targetBackend,
      itemCount: sourceItems.length,
      targetItemCount: 0,
      issues,
    };
  }
}

async function verifyReopenedTargetRepository(
  createRepository: () => VaultStorageRepository | Promise<VaultStorageRepository>,
  masterPasswordPlain: string,
  sourceItems: VaultItem[],
  sourceIds: Set<string>,
  issues: string[],
): Promise<VaultItem[] | null> {
  try {
    const reopenedRepository = await createRepository();
    await reopenedRepository.hydrate();

    const passwordValid = await reopenedRepository.verifyPassword(masterPasswordPlain);
    if (!passwordValid) {
      issues.push('vault-storage-migration-persistent-target-reopen-password-invalid');
      return null;
    }

    const reopenedTargetItems = await reopenedRepository.getVaultItems(masterPasswordPlain);
    validateMigratedItems(sourceItems, sourceIds, reopenedTargetItems, issues);
    return reopenedTargetItems;
  } catch (error) {
    issues.push(migrationIssueFromError(error, 'vault-storage-migration-persistent-target-reopen-failed'));
    return null;
  }
}

function blocked(
  sourceBackend: VaultStorageBackendKind,
  targetBackend: VaultStorageBackendKind,
  issues: string[],
): VaultStorageMigrationResult {
  return {
    status: 'blocked',
    sourceBackend,
    targetBackend,
    itemCount: 0,
    targetItemCount: 0,
    issues,
  };
}

function collectUniqueItemIds(
  items: Array<{ id?: string }>,
  issues: string[],
  scope: 'source' | 'target',
): Set<string> {
  const seenIds = new Set<string>();
  const missingIssue = scope === 'source'
    ? 'vault-storage-migration-missing-item-id'
    : 'vault-storage-migration-target-missing-item-id';
  const duplicateIssue = scope === 'source'
    ? 'vault-storage-migration-duplicate-item-id'
    : 'vault-storage-migration-target-duplicate-item-id';

  for (const item of items) {
    if (!item.id) {
      issues.push(missingIssue);
      continue;
    }

    if (seenIds.has(item.id)) {
      issues.push(duplicateIssue);
      continue;
    }

    seenIds.add(item.id);
  }

  return seenIds;
}

function validateMigratedItems(
  sourceItems: VaultItem[],
  sourceIds: Set<string>,
  targetItems: VaultItem[],
  issues: string[],
): void {
  if (targetItems.length !== sourceItems.length) {
    issues.push('vault-storage-migration-target-count-mismatch');
  }

  const targetIds = collectUniqueItemIds(targetItems, issues, 'target');
  const sourceById = new Map(sourceItems.map((item) => [item.id, item]));
  const targetById = new Map(targetItems.map((item) => [item.id, item]));

  for (const sourceId of sourceIds) {
    if (!targetIds.has(sourceId)) {
      issues.push('vault-storage-migration-target-missing-source-id');
      continue;
    }

    const sourceItem = sourceById.get(sourceId);
    const targetItem = targetById.get(sourceId);
    if (sourceItem && targetItem && !areVaultItemsEquivalent(sourceItem, targetItem)) {
      issues.push('vault-storage-migration-target-content-mismatch');
    }
  }

  for (const targetId of targetIds) {
    if (!sourceIds.has(targetId)) {
      issues.push('vault-storage-migration-target-extra-id');
    }
  }
}

function areVaultItemsEquivalent(sourceItem: VaultItem, targetItem: VaultItem): boolean {
  const normalizedSource = normalizeVaultItemForMigration(sourceItem);
  const normalizedTarget = normalizeVaultItemForMigration(targetItem);
  return JSON.stringify(normalizedSource) === JSON.stringify(normalizedTarget);
}

function normalizeVaultItemForMigration(item: VaultItem): VaultItem {
  return {
    ...item,
    favorite: Boolean(item.favorite),
    deleted: Boolean(item.deleted),
    deletedAt: item.deletedAt || undefined,
    notes: item.notes || undefined,
    password: item.password || undefined,
    totpSecret: item.totpSecret || undefined,
  };
}

function migrationIssueFromError(error: unknown, fallback: string): string {
  const rawMessage = error instanceof Error ? error.message : String(error || fallback);
  const sanitizedMessage = rawMessage
    .replace(/[\r\n\t]/g, ' ')
    .replace(/<script/gi, '&lt;script')
    .replace(/[<>]/g, '_')
    .trim()
    .slice(0, 160);

  return sanitizedMessage || fallback;
}

async function rollbackTarget(targetRepository: VaultStorageRepository, issues: string[]): Promise<void> {
  try {
    await targetRepository.resetAll();
  } catch (error) {
    issues.push(migrationIssueFromError(error, 'vault-storage-migration-target-rollback-failed'));
  }
}
