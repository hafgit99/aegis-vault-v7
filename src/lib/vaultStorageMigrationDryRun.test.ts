/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import { runVaultStorageMigrationDryRun } from './vaultStorageMigrationDryRun';
import type { VaultStorageBackendSelection } from './vaultStorageBackend';
import type { VaultStorageRepository } from './vaultStorageRepository';

function item(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Example',
    username: 'user@example.com',
    password: 'secret',
    url: 'https://example.com',
    notes: '',
    category: 'login',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as VaultItem;
}

function repositoryStub(items: VaultItem[], isPasswordValid = true): VaultStorageRepository {
  return {
    hydrate: vi.fn(async () => undefined),
    clearDerivedKeyCache: vi.fn(),
    subscribeLogs: vi.fn(() => vi.fn()),
    getQueryLogs: vi.fn(() => []),
    logQuery: vi.fn(),
    verifyPassword: vi.fn(async () => isPasswordValid),
    setupMaster: vi.fn(async () => undefined),
    changeMasterPassword: vi.fn(async () => undefined),
    deriveEncryptionKey: vi.fn(async () => new Uint8Array(32)),
    getVaultItems: vi.fn(async () => items),
    saveVaultItem: vi.fn(async () => items),
    saveVaultItems: vi.fn(async () => items),
    executeCustomSQL: vi.fn(() => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => undefined),
    deletePermanently: vi.fn(async () => items),
    deletePermanentlyBatch: vi.fn(async () => items),
    reseedDemo: vi.fn(async () => items),
  };
}

const dryRunSelection: VaultStorageBackendSelection = {
  active: 'opfs',
  target: 'wa-sqlite',
  mode: 'dry-run',
};

describe('vault storage migration dry-run', () => {
  it('stays disabled when no dry-run target is configured', async () => {
    const repository = repositoryStub([item()]);

    await expect(runVaultStorageMigrationDryRun(repository, {
      active: 'opfs',
      target: null,
      mode: 'active',
    }, 'master-pass')).resolves.toEqual({
      status: 'disabled',
      sourceBackend: 'opfs',
      targetBackend: null,
      itemCount: 0,
      issues: ['vault-storage-dry-run-disabled'],
    });

    expect(repository.verifyPassword).not.toHaveBeenCalled();
    expect(repository.getVaultItems).not.toHaveBeenCalled();
  });

  it('reports a ready plan without writing to the repository', async () => {
    const repository = repositoryStub([item(), item({ id: 'item-2' })]);

    await expect(runVaultStorageMigrationDryRun(repository, dryRunSelection, 'master-pass')).resolves.toEqual({
      status: 'ready',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 2,
      issues: [],
    });

    expect(repository.verifyPassword).toHaveBeenCalledWith('master-pass');
    expect(repository.getVaultItems).toHaveBeenCalledWith('master-pass');
    expect(repository.saveVaultItem).not.toHaveBeenCalled();
    expect(repository.saveVaultItems).not.toHaveBeenCalled();
    expect(repository.resetAll).not.toHaveBeenCalled();
  });

  it('blocks dry-run plans when credentials cannot unlock the source vault', async () => {
    const repository = repositoryStub([item()], false);

    await expect(runVaultStorageMigrationDryRun(repository, dryRunSelection, 'wrong-pass')).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 0,
      issues: ['vault-storage-dry-run-invalid-password'],
    });

    expect(repository.getVaultItems).not.toHaveBeenCalled();
  });

  it('blocks duplicate or malformed item identifiers before migration work starts', async () => {
    const repository = repositoryStub([
      item({ id: 'duplicate' }),
      item({ id: 'duplicate' }),
      item({ id: '' }),
    ]);

    await expect(runVaultStorageMigrationDryRun(repository, dryRunSelection, 'master-pass')).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 3,
      issues: [
        'vault-storage-dry-run-duplicate-item-id',
        'vault-storage-dry-run-missing-item-id',
      ],
    });
  });
});
