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
  issues: string[];
}

export async function runVaultStorageMigrationDryRun(
  repository: VaultStorageRepository,
  selection: VaultStorageBackendSelection,
  masterPasswordPlain: string,
): Promise<VaultStorageMigrationDryRunResult> {
  if (selection.mode !== 'dry-run' || !selection.target) {
    return {
      status: 'disabled',
      sourceBackend: selection.active,
      targetBackend: selection.target,
      itemCount: 0,
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
      issues: ['vault-storage-dry-run-invalid-password'],
    };
  }

  const items = await repository.getVaultItems(masterPasswordPlain);
  const issues: string[] = [];
  const seenIds = new Set<string>();

  for (const item of items) {
    if (!item.id) {
      issues.push('vault-storage-dry-run-missing-item-id');
      continue;
    }

    if (seenIds.has(item.id)) {
      issues.push('vault-storage-dry-run-duplicate-item-id');
      continue;
    }

    seenIds.add(item.id);
  }

  return {
    status: issues.length > 0 ? 'blocked' : 'ready',
    sourceBackend: selection.active,
    targetBackend: selection.target,
    itemCount: items.length,
    issues,
  };
}
