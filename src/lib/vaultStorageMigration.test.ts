/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import { runVaultStorageMigration } from './vaultStorageMigration';
import type { VaultStorageRepository } from './vaultStorageRepository';

function item(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Example',
    username: 'user@example.com',
    password: 'Secret-123!',
    url: 'https://example.test',
    notes: 'private note',
    category: 'login',
    favorite: false,
    deleted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function passingSmoke() {
  return vi.fn(async () => ({
    status: 'passed' as const,
    databaseName: '/aegis-wa-sqlite.test.db',
    vfsName: 'aegis-wa-sqlite-test-idb',
  }));
}

function failingSmoke(issue = 'wa-sqlite-persistent-vfs-not-ready') {
  return vi.fn(async () => ({
    status: 'failed' as const,
    databaseName: '/aegis-wa-sqlite.test.db',
    vfsName: null,
    issue,
  }));
}

function repositoryStub(items: VaultItem[], isPasswordValid = true): VaultStorageRepository {
  let storedItems = items.map((candidate) => ({ ...candidate }));

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
    getVaultItems: vi.fn(async () => storedItems.map((candidate) => ({ ...candidate }))),
    getVaultItemsWithKey: vi.fn(async () => storedItems.map((candidate) => ({ ...candidate }))),
    saveVaultItem: vi.fn(async (candidate: VaultItem) => {
      storedItems = [candidate];
      return storedItems.map((saved) => ({ ...saved }));
    }),
    saveVaultItems: vi.fn(async (candidates: VaultItem[]) => {
      storedItems = candidates.map((candidate) => ({ ...candidate }));
      return storedItems.map((candidate) => ({ ...candidate }));
    }),
    executeCustomSQL: vi.fn(() => ({ columns: [], rows: [] })),
    resetAll: vi.fn(async () => {
      storedItems = [];
    }),
    deletePermanently: vi.fn(async () => []),
    deletePermanentlyBatch: vi.fn(async () => []),
    reseedDemo: vi.fn(async () => []),
  };
}

describe('vault storage migration', () => {
  it('migrates OPFS items into the wa-sqlite target and verifies integrity', async () => {
    const sourceRepository = repositoryStub([item(), item({ id: 'item-2', title: 'Second' })]);
    const targetRepository = repositoryStub([]);

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
    })).resolves.toEqual({
      status: 'migrated',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 2,
      targetItemCount: 2,
      issues: [],
    });

    expect(sourceRepository.verifyPassword).toHaveBeenCalledWith('master-pass');
    expect(vi.mocked(targetRepository.resetAll).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(targetRepository.setupMaster).mock.invocationCallOrder[0]!,
    );
    expect(targetRepository.setupMaster).toHaveBeenCalledWith('master-pass');
    expect(targetRepository.saveVaultItems).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'item-1', password: 'Secret-123!' }),
      expect.objectContaining({ id: 'item-2', title: 'Second' }),
    ], 'master-pass');
    await expect(targetRepository.getVaultItems('master-pass')).resolves.toHaveLength(2);
  });

  it('verifies reopened persistent target parity before reporting migration success', async () => {
    const sourceRepository = repositoryStub([item(), item({ id: 'item-2', title: 'Second' })]);
    const targetRepository = repositoryStub([]);
    const reopenedRepository = repositoryStub([item(), item({ id: 'item-2', title: 'Second' })]);
    const reopenTargetRepository = vi.fn(async () => reopenedRepository);

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
      reopenTargetRepository,
    })).resolves.toEqual({
      status: 'migrated',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 2,
      targetItemCount: 2,
      issues: [],
    });

    expect(reopenTargetRepository).toHaveBeenCalledOnce();
    expect(reopenedRepository.hydrate).toHaveBeenCalledOnce();
    expect(reopenedRepository.verifyPassword).toHaveBeenCalledWith('master-pass');
    expect(reopenedRepository.getVaultItems).toHaveBeenCalledWith('master-pass');
    expect(targetRepository.resetAll).toHaveBeenCalledTimes(1);
  });

  it('rolls back when reopened persistent target verification rejects the master password', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    const reopenedRepository = repositoryStub([item()], false);

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
      reopenTargetRepository: () => reopenedRepository,
    })).resolves.toEqual({
      status: 'rolled-back',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 1,
      issues: ['vault-storage-migration-persistent-target-reopen-password-invalid'],
    });

    expect(targetRepository.resetAll).toHaveBeenCalledTimes(1);
    expect(reopenedRepository.resetAll).toHaveBeenCalledTimes(1);
  });

  it('rolls back when reopened persistent target content does not match the source', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    const reopenedRepository = repositoryStub([item({ password: 'tampered-after-reopen' })]);

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
      reopenTargetRepository: () => reopenedRepository,
    })).resolves.toEqual({
      status: 'rolled-back',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 1,
      issues: ['vault-storage-migration-target-content-mismatch'],
    });

    expect(targetRepository.resetAll).toHaveBeenCalledTimes(1);
    expect(reopenedRepository.resetAll).toHaveBeenCalledTimes(1);
  });

  it('rolls back when reopened persistent target hydration fails', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    const reopenedRepository = repositoryStub([item()]);
    vi.mocked(reopenedRepository.hydrate).mockRejectedValue(new Error('reopen failed\n<script>secret</script>'));

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
      reopenTargetRepository: () => reopenedRepository,
    })).resolves.toEqual({
      status: 'rolled-back',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 1,
      issues: ['reopen failed &lt;script_secret_/script_'],
    });

    expect(targetRepository.resetAll).toHaveBeenCalledTimes(2);
  });

  it('blocks migration before target writes when the source password is invalid', async () => {
    const sourceRepository = repositoryStub([item()], false);
    const targetRepository = repositoryStub([]);

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'wrong-pass')).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 0,
      targetItemCount: 0,
      issues: ['vault-storage-migration-invalid-source-password'],
    });

    expect(sourceRepository.getVaultItems).not.toHaveBeenCalled();
    expect(targetRepository.setupMaster).not.toHaveBeenCalled();
    expect(targetRepository.saveVaultItems).not.toHaveBeenCalled();
  });

  it('blocks malformed source item identifiers before target writes', async () => {
    const sourceRepository = repositoryStub([
      item({ id: 'duplicate' }),
      item({ id: 'duplicate', title: 'Duplicate' }),
      item({ id: '' }),
    ]);
    const targetRepository = repositoryStub([]);

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass')).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 3,
      targetItemCount: 0,
      issues: [
        'vault-storage-migration-duplicate-item-id',
        'vault-storage-migration-missing-item-id',
      ],
    });

    expect(targetRepository.resetAll).not.toHaveBeenCalled();
    expect(targetRepository.saveVaultItems).not.toHaveBeenCalled();
  });

  it('blocks migration before target writes when persistent wa-sqlite smoke fails', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    const verifyPersistentTarget = failingSmoke('wa-sqlite-persistence-smoke-mismatch');

    await expect(runVaultStorageMigration(
      sourceRepository,
      targetRepository,
      'master-pass',
      'opfs',
      'wa-sqlite',
      { verifyPersistentTarget },
    )).resolves.toEqual({
      status: 'blocked',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 0,
      issues: [
        'vault-storage-migration-persistent-target-smoke-failed',
        'wa-sqlite-persistence-smoke-mismatch',
      ],
    });

    expect(verifyPersistentTarget).toHaveBeenCalledOnce();
    expect(targetRepository.hydrate).not.toHaveBeenCalled();
    expect(targetRepository.resetAll).not.toHaveBeenCalled();
    expect(targetRepository.saveVaultItems).not.toHaveBeenCalled();
  });

  it('rolls back the target when wa-sqlite writes fail', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    vi.mocked(targetRepository.saveVaultItems).mockRejectedValueOnce(new Error('target write failed'));

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
    })).resolves.toEqual({
      status: 'rolled-back',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 0,
      issues: ['target write failed'],
    });

    expect(targetRepository.resetAll).toHaveBeenCalledTimes(2);
  });

  it('verifies the source vault remains unchanged after target rollback', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    vi.mocked(sourceRepository.getVaultItems)
      .mockResolvedValueOnce([item()])
      .mockResolvedValueOnce([item({ password: 'source tampered after rollback' })]);
    vi.mocked(targetRepository.saveVaultItems).mockRejectedValueOnce(new Error('target write failed'));

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
    })).resolves.toEqual({
      status: 'rolled-back',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 0,
      issues: [
        'target write failed',
        'vault-storage-migration-source-drift-after-rollback',
        'vault-storage-migration-source-content-mismatch-after-rollback',
      ],
    });

    expect(sourceRepository.verifyPassword).toHaveBeenCalledTimes(2);
    expect(sourceRepository.getVaultItems).toHaveBeenCalledTimes(2);
    expect(targetRepository.resetAll).toHaveBeenCalledTimes(2);
  });

  it('rolls back the target when post-migration integrity checks fail', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    vi.mocked(targetRepository.getVaultItems).mockResolvedValueOnce([
      item({ password: 'tampered' }),
    ]);

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
    })).resolves.toEqual({
      status: 'rolled-back',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 1,
      issues: ['vault-storage-migration-target-content-mismatch'],
    });

    expect(targetRepository.resetAll).toHaveBeenCalledTimes(2);
  });

  it('reports target rollback failures without hiding the original failure', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    vi.mocked(targetRepository.saveVaultItems).mockRejectedValueOnce(new Error('target write failed'));
    vi.mocked(targetRepository.resetAll).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('target rollback failed'));

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
    })).resolves.toEqual({
      status: 'rolled-back',
      sourceBackend: 'opfs',
      targetBackend: 'wa-sqlite',
      itemCount: 1,
      targetItemCount: 0,
      issues: ['target write failed', 'target rollback failed'],
    });
  });
  it('sanitizes target error messages before they become migration issues', async () => {
    const sourceRepository = repositoryStub([item()]);
    const targetRepository = repositoryStub([]);
    vi.mocked(targetRepository.saveVaultItems).mockRejectedValueOnce(
      new Error('target failed\n<script>alert("secret")</script>'),
    );

    await expect(runVaultStorageMigration(sourceRepository, targetRepository, 'master-pass', 'opfs', 'wa-sqlite', {
      verifyPersistentTarget: passingSmoke(),
    })).resolves.toMatchObject({
      status: 'rolled-back',
      issues: ['target failed &lt;script_alert("secret")_/script_'],
    });
  });
});
