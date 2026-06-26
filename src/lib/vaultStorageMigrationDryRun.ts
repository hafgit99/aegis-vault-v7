/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultStorageRepository } from './vaultStorageRepository';
import type { VaultStorageBackendSelection } from './vaultStorageBackend';

export type VaultStorageMigrationDryRunStatus = 'disabled' | 'ready' | 'blocked';

export interface VaultStorageMigrationDryRunResult {
  status: VaultStorageMigrationDryRunStatus;
  sourceBackend: VaultStorageBackendSelection['active'];
  targetBackend: VaultStorageBackendSelection['target'];
  itemCount: number;
  targetItemCount: number;
  issues: string[];
}

export async function runVaultStorageMigrationDryRun(
  repository: VaultStorageRepository,
  selection: VaultStorageBackendSelection,
  masterPasswordPlain: string,
  targetRepository?: VaultStorageRepository | null,
): Promise<VaultStorageMigrationDryRunResult> {
  if (selection.mode !== 'dry-run' || !selection.target) {
    return {
      status: 'disabled',
      sourceBackend: selection.active,
      targetBackend: selection.target,
      itemCount: 0,
      targetItemCount: 0,
      issues: ['vault-storage-dry-run-disabled'],
    };
  }

  const isPasswordValid = await repository.verifyPassword(masterPasswordPlain);
  if (!isPasswordValid) {
    return {
      status: 'blocked',
      sourceBackend: selection.active,
      targetBackend: selection.target,
      itemCount: 0,
      targetItemCount: 0,
      issues: ['vault-storage-dry-run-invalid-password'],
    };
  }

  const items = await repository.getVaultItems(masterPasswordPlain);
  const issues: string[] = [];
  const sourceIds = collectUniqueItemIds(items, issues, 'source');
  let targetItemCount = 0;

  if (targetRepository && issues.length === 0) {
    try {
      await targetRepository.hydrate();
      const targetItems = await targetRepository.getVaultItems(masterPasswordPlain);
      targetItemCount = targetItems.length;
      validateTargetItems(items.length, sourceIds, targetItems, issues);
    } catch {
      issues.push('vault-storage-dry-run-target-read-failed');
    }
  }

  return {
    status: issues.length > 0 ? 'blocked' : 'ready',
    sourceBackend: selection.active,
    targetBackend: selection.target,
    itemCount: items.length,
    targetItemCount,
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
    ? 'vault-storage-dry-run-missing-item-id'
    : 'vault-storage-dry-run-target-missing-item-id';
  const duplicateIssue = scope === 'source'
    ? 'vault-storage-dry-run-duplicate-item-id'
    : 'vault-storage-dry-run-target-duplicate-item-id';

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

function validateTargetItems(
  sourceItemCount: number,
  sourceIds: Set<string>,
  targetItems: Array<{ id?: string }>,
  issues: string[],
): void {
  if (targetItems.length !== sourceItemCount) {
    issues.push('vault-storage-dry-run-target-count-mismatch');
  }

  const targetIds = collectUniqueItemIds(targetItems, issues, 'target');

  for (const sourceId of sourceIds) {
    if (!targetIds.has(sourceId)) {
      issues.push('vault-storage-dry-run-target-missing-source-id');
    }
  }

  for (const targetId of targetIds) {
    if (!sourceIds.has(targetId)) {
      issues.push('vault-storage-dry-run-target-extra-id');
    }
  }
}