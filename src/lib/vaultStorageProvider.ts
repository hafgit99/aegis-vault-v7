/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sqliteOPFSInstance } from './sqlite_opfs';
import { getVaultStorageBackendSelection, type VaultStorageBackendSelection } from './vaultStorageBackend';
import { createReadOnlyWaSqliteVaultStorageAdapter } from './vaultStorageWaSqliteAdapter';
import type { VaultStorageRepository } from './vaultStorageRepository';
import { createWaSqliteEngine } from './waSqliteEngine';

let activeVaultStorageRepository: VaultStorageRepository = sqliteOPFSInstance;

export function getVaultStorageRepository(): VaultStorageRepository {
  return activeVaultStorageRepository;
}

export function getActiveVaultStorageBackendSelection() {
  return getVaultStorageBackendSelection();
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
export function setVaultStorageRepositoryForTesting(repository: VaultStorageRepository): () => void {
  const previousRepository = activeVaultStorageRepository;
  activeVaultStorageRepository = repository;

  return () => {
    activeVaultStorageRepository = previousRepository;
  };
}
