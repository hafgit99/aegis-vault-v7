// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { getVaultStorageRepository, setVaultStorageRepositoryForTesting } from './vaultStorageProvider';
import type { VaultStorageRepository } from './vaultStorageRepository';

function createRepositoryStub(): VaultStorageRepository {
  return {
    hydrate: vi.fn(async () => undefined),
    clearDerivedKeyCache: vi.fn(),
    subscribeLogs: vi.fn(() => vi.fn()),
    getQueryLogs: vi.fn(() => []),
    logQuery: vi.fn(),
    verifyPassword: vi.fn(async () => false),
    setupMaster: vi.fn(async () => undefined),
    changeMasterPassword: vi.fn(async () => undefined),
    deriveEncryptionKey: vi.fn(async () => new Uint8Array(32)),
    getVaultItems: vi.fn(async () => []),
    saveVaultItem: vi.fn(async () => []),
    saveVaultItems: vi.fn(async () => []),
    executeCustomSQL: vi.fn(() => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => undefined),
    deletePermanently: vi.fn(async () => []),
    deletePermanentlyBatch: vi.fn(async () => []),
    reseedDemo: vi.fn(async () => []),
  };
}

describe('vault storage provider', () => {
  it('uses the OPFS repository by default', () => {
    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
  });

  it('can temporarily swap the active repository for migration tests', () => {
    const repository = createRepositoryStub();
    const restore = setVaultStorageRepositoryForTesting(repository);

    expect(getVaultStorageRepository()).toBe(repository);

    restore();

    expect(getVaultStorageRepository()).toBe(sqliteOPFSInstance);
  });
});
