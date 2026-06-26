/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sqliteOPFSInstance } from './sqlite_opfs';
import { getVaultStorageBackendSelection } from './vaultStorageBackend';
import type { VaultStorageRepository } from './vaultStorageRepository';

let activeVaultStorageRepository: VaultStorageRepository = sqliteOPFSInstance;

export function getVaultStorageRepository(): VaultStorageRepository {
  return activeVaultStorageRepository;
}

export function getActiveVaultStorageBackendSelection() {
  return getVaultStorageBackendSelection();
}

export function setVaultStorageRepositoryForTesting(repository: VaultStorageRepository): () => void {
  const previousRepository = activeVaultStorageRepository;
  activeVaultStorageRepository = repository;

  return () => {
    activeVaultStorageRepository = previousRepository;
  };
}
