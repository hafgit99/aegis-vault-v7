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
      targetItemCount: 0,
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
      targetItemCount: 0,
      issues: [],
    });

    expect(repository.verifyPassword).toHaveBeenCalledWith('master-pass');
    expect(repository.getVaultItems).toHaveBeenCalledWith('master-pass');
    expect(repository.saveVaultItem).not.toHaveBeenCalled();
    expect(repository.saveVaultItems).not.toHaveBeenCalled();
    expect(repository.resetAll).not.toHaveBeenCalled();
  });

  it('validates a target repository after source checks pass', async () => {
    const repository = repositoryStub([item(), item({ id: 'item-2' })]);
    const targetRepository = repositoryStub([item({ title: 'Mirror' }), item({ id: 'item-2', title: 'Mirror 2' })]);

    await expect(runVaultStorageMigrationDryRun(
      repository,
      dryRunSelection,
      'master-pass',
      targetRepository,
    )).resolves.toEqual({
      status: 'ready',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 2,
      targetItemCount: 2,
      issues: [],
    });

    expect(targetRepository.hydrate).toHaveBeenCalledOnce();
    expect(targetRepository.getVaultItems).toHaveBeenCalledWith('master-pass');
    expect(targetRepository.saveVaultItems).not.toHaveBeenCalled();
  });

  it('blocks dry-run plans when target repository identity checks fail', async () => {
    const repository = repositoryStub([item(), item({ id: 'item-2' })]);
    const targetRepository = repositoryStub([
      item({ id: 'item-1' }),
      item({ id: 'unexpected' }),
      item({ id: '' }),
    ]);

    await expect(runVaultStorageMigrationDryRun(
      repository,
      dryRunSelection,
      'master-pass',
      targetRepository,
    )).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 2,
      targetItemCount: 3,
      issues: [
        'vault-storage-dry-run-target-count-mismatch',
        'vault-storage-dry-run-target-missing-item-id',
        'vault-storage-dry-run-target-missing-source-id',
        'vault-storage-dry-run-target-extra-id',
      ],
    });
  });

  it('blocks dry-run plans when target repository cannot be read', async () => {
    const repository = repositoryStub([item()]);
    const targetRepository = repositoryStub([item()]);
    vi.mocked(targetRepository.getVaultItems).mockRejectedValueOnce(new Error('target unavailable'));

    await expect(runVaultStorageMigrationDryRun(
      repository,
      dryRunSelection,
      'master-pass',
      targetRepository,
    )).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 0,
      issues: ['vault-storage-dry-run-target-read-failed'],
    });
  });

  it('blocks dry-run plans when credentials cannot unlock the source vault', async () => {
    const repository = repositoryStub([item()], false);
    const targetRepository = repositoryStub([item()]);

    await expect(runVaultStorageMigrationDryRun(repository, dryRunSelection, 'wrong-pass', targetRepository)).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 0,
      targetItemCount: 0,
      issues: ['vault-storage-dry-run-invalid-password'],
    });

    expect(repository.getVaultItems).not.toHaveBeenCalled();
    expect(targetRepository.hydrate).not.toHaveBeenCalled();
  });

  it('blocks duplicate or malformed item identifiers before migration work starts', async () => {
    const repository = repositoryStub([
      item({ id: 'duplicate' }),
      item({ id: 'duplicate' }),
      item({ id: '' }),
    ]);
    const targetRepository = repositoryStub([item({ id: 'duplicate' })]);

    await expect(runVaultStorageMigrationDryRun(repository, dryRunSelection, 'master-pass', targetRepository)).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 3,
      targetItemCount: 0,
      issues: [
        'vault-storage-dry-run-duplicate-item-id',
        'vault-storage-dry-run-missing-item-id',
      ],
    });

    expect(targetRepository.hydrate).not.toHaveBeenCalled();
  });
});