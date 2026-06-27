/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WaSqlitePromotionReadinessReport } from './waSqlitePromotionReadiness';

export type VaultStorageBackendKind = 'opfs' | 'wa-sqlite';
export type VaultStorageBackendMode = 'active' | 'dry-run';

export interface VaultStorageBackendSelection {
  active: VaultStorageBackendKind;
  target: VaultStorageBackendKind | null;
  mode: VaultStorageBackendMode;
}

export interface VaultStorageBackendSelectionOptions {
  waSqlitePromotionReadiness?: WaSqlitePromotionReadinessReport | null;
  activeWaSqliteProviderEnabled?: boolean;
}

export class VaultStorageBackendSelectionError extends Error {
  constructor(
    public readonly code: string,
    public readonly issues: string[] = [code],
  ) {
    super(code);
    this.name = 'VaultStorageBackendSelectionError';
  }
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

export function parseVaultStorageBackendSelection(
  rawValue: string | undefined,
  options: VaultStorageBackendSelectionOptions = {},
): VaultStorageBackendSelection {
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
    const issues = collectWaSqliteActiveBackendIssues(options);
    if (issues.length > 0) {
      throw new VaultStorageBackendSelectionError('vault-storage-backend-wa-sqlite-not-ready', issues);
    }

    return {
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    };
  }

  throw new VaultStorageBackendSelectionError('vault-storage-backend-unsupported');
}

function collectWaSqliteActiveBackendIssues(options: VaultStorageBackendSelectionOptions): string[] {
  const issues: string[] = [];
  const readiness = options.waSqlitePromotionReadiness;

  if (!readiness) {
    issues.push('wa-sqlite-promotion-readiness-not-provided');
  } else if (readiness.status !== 'ready') {
    issues.push(...readiness.issues);
  }

  if (!options.activeWaSqliteProviderEnabled) {
    issues.push('wa-sqlite-active-provider-not-enabled');
  }

  return Array.from(new Set(issues));
}

export function getVaultStorageBackendSelection(): VaultStorageBackendSelection {
  return parseVaultStorageBackendSelection(readBuildTimeBackendFlag());
}
