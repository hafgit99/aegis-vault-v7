/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VaultStorageBackendKind = 'opfs' | 'wa-sqlite';
export type VaultStorageBackendMode = 'active' | 'dry-run';

export interface VaultStorageBackendSelection {
  active: VaultStorageBackendKind;
  target: VaultStorageBackendKind | null;
  mode: VaultStorageBackendMode;
}

const STORAGE_BACKEND_ENV_KEY = 'VITE_AEGIS_STORAGE_BACKEND';
const DEFAULT_SELECTION: VaultStorageBackendSelection = {
  active: 'opfs',
  target: null,
  mode: 'active',
};

function readBuildTimeBackendFlag(): string | undefined {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[STORAGE_BACKEND_ENV_KEY];
}

export function parseVaultStorageBackendSelection(rawValue: string | undefined): VaultStorageBackendSelection {
  const normalizedValue = rawValue?.trim().toLowerCase();
  if (!normalizedValue || normalizedValue === 'opfs') {
    return { ...DEFAULT_SELECTION };
  }

  if (normalizedValue === 'wa-sqlite-dry-run') {
    return {
      active: 'opfs',
      target: 'wa-sqlite',
      mode: 'dry-run',
    };
  }

  if (normalizedValue === 'wa-sqlite' || normalizedValue === 'sqlite') {
    throw new Error('vault-storage-backend-wa-sqlite-not-ready');
  }

  throw new Error('vault-storage-backend-unsupported');
}

export function getVaultStorageBackendSelection(): VaultStorageBackendSelection {
  return parseVaultStorageBackendSelection(readBuildTimeBackendFlag());
}
