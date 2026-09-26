/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * K-4: rebuilding an unreadable vault from an encrypted snapshot, while the
 * vault is still locked.
 *
 * The ordering here is the safety property. A wrong password must be rejected
 * BEFORE anything destructive happens, and the user's master password must keep
 * working afterwards.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getVaultSnapshots = vi.hoisted(() => vi.fn(async () => [] as any[]));
const decryptDataWithPasswordSecure = vi.hoisted(() => vi.fn(async () => '{}'));
const validateBackupPayload = vi.hoisted(() => vi.fn((payload: unknown) => payload as any));
const repository = vi.hoisted(() => ({
  hydrate: vi.fn(async () => undefined),
  resetAll: vi.fn(async () => undefined),
  setupMasterWithHash: vi.fn(async () => undefined),
  setupMaster: vi.fn(async () => undefined),
  deriveEncryptionKey: vi.fn(async () => new Uint8Array(32).fill(3)),
  saveVaultItemsWithKey: vi.fn(async () => []),
}));
const importAttachments = vi.hoisted(() => vi.fn(async () => undefined));
const openVaultSession = vi.hoisted(() => vi.fn());
const closeVaultSession = vi.hoisted(() => vi.fn());
const openDerivedVaultSession = vi.hoisted(() => vi.fn());
const clearAllSetupFlagsSync = vi.hoisted(() => vi.fn());
const clearPersistedActiveVaultStorageBackend = vi.hoisted(() => vi.fn());
const clearVaultIntegrityLedger = vi.hoisted(() => vi.fn());
const invoke = vi.hoisted(() => vi.fn());
const isDesktopRuntime = vi.hoisted(() => false);
const sqliteOPFSInstance = vi.hoisted(() => ({ hydrate: vi.fn(async () => undefined) }));

vi.mock('./snapshots', () => ({ getVaultSnapshots }));
vi.mock('./encryption', () => ({ decryptDataWithPasswordSecure }));
vi.mock('./backupValidation', () => ({ validateBackupPayload }));
vi.mock('./vaultStorageProvider', () => ({
  getVaultStorageRepository: () => repository,
  clearPersistedActiveVaultStorageBackend,
  restoreOrActivateDefaultVaultStorageBackend: vi.fn(async () => 'opfs'),
}));
vi.mock('./attachments', () => ({ importAttachments, migrateLegacyAttachmentsToAesGcm: vi.fn(async () => undefined), reencryptAttachmentsForVaultKeyChange: vi.fn(async () => undefined) }));
vi.mock('./indexedDbStorage', () => ({
  initializeIndexedDbStorage: vi.fn(async () => undefined),
  getIndexedDbItemSync: vi.fn(() => null),
  setIndexedDbItemSync: vi.fn(),
  removeIndexedDbItemSync: vi.fn(),
  clearAllSetupFlagsSync,
}));
vi.mock('./vaultIntegrityLedger', () => ({ clearVaultIntegrityLedger }));
vi.mock('./desktopStorage', () => ({
  isAndroidRuntime: () => false,
  isDesktopRuntime: () => isDesktopRuntime,
}));
vi.mock('./sqlite_opfs', () => ({ sqliteOPFSInstance }));
vi.mock('./vaultSession', () => ({
  openVaultSession,
  closeVaultSession,
  openDerivedVaultSession,
  updateActiveVaultEncryptionKey: vi.fn(),
  withActiveAccountSecretKey: vi.fn(() => null),
  // These two invoke the callback synchronously, like the real implementations:
  // the rebuild path depends on the session key actually reaching the write.
  withActiveSessionSecrets: vi.fn((fn: (bytes: Uint8Array) => unknown) => fn(new Uint8Array(32).fill(5))),
  withActiveVaultEncryptionKey: vi.fn((fn: (key: Uint8Array) => unknown) => fn(new Uint8Array(32).fill(5))),
}));
vi.mock('./biometric', () => ({ disableBiometric: vi.fn(), hydrateBiometric: vi.fn(async () => undefined) }));
vi.mock('./recoveryKey', () => ({ disableRecoveryKey: vi.fn(async () => undefined) }));
vi.mock('./argon2id', () => ({ getDefaultKdfProfile: () => ({ memoryKiB: 32768, iterations: 3, parallelism: 1, hashLength: 32 }) }));
vi.mock('./secureStorage', () => ({
  getSecureStorageItem: vi.fn(async () => null),
  isSecureStorageAvailable: vi.fn(async () => false),
  removeSecureStorageItem: vi.fn(async () => undefined),
  secureStorageKeys: {},
  setSecureStorageItem: vi.fn(async () => undefined),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { rebuildVaultFromSnapshot } from './storage';

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  id: 'snap-1',
  createdAt: '2026-09-26T10:00:00.000Z',
  trigger: 'auto',
  encryptedPayload: 'ciphertext',
  ...overrides,
});

const payload = {
  items: [
    { id: 'a', title: 'One', category: 'login', username: 'u', password: 'p', notes: '', favorite: false, createdAt: '', updatedAt: '' },
    { id: 'b', title: 'Two', category: 'login', username: 'u2', password: 'p2', notes: '', favorite: false, createdAt: '', updatedAt: '' },
  ],
  attachments: [{ id: 'att-1' }],
};

describe('K-4: rebuildVaultFromSnapshot', () => {
  beforeEach(() => {
    getVaultSnapshots.mockReset();
    getVaultSnapshots.mockResolvedValue([snapshot()]);
    decryptDataWithPasswordSecure.mockReset();
    decryptDataWithPasswordSecure.mockResolvedValue(JSON.stringify(payload));
    validateBackupPayload.mockReset();
    validateBackupPayload.mockReturnValue(payload);
    repository.resetAll.mockClear();
    repository.setupMaster.mockClear();
    importAttachments.mockClear();
    clearVaultIntegrityLedger.mockClear();
    openDerivedVaultSession.mockClear();
    closeVaultSession.mockClear();
  });

  it('rejects an unknown snapshot id before touching the vault', async () => {
    getVaultSnapshots.mockResolvedValue([]);

    await expect(rebuildVaultFromSnapshot('nope', 'pass')).rejects.toThrow('snapshot-not-found');
    expect(repository.resetAll).not.toHaveBeenCalled();
    expect(decryptDataWithPasswordSecure).not.toHaveBeenCalled();
  });

  it('rejects a wrong password BEFORE the destructive reset', async () => {
    // This ordering is the whole safety property: a mistyped password must not
    // be able to wipe the damaged vault.
    decryptDataWithPasswordSecure.mockRejectedValue(new Error('bad tag'));

    await expect(rebuildVaultFromSnapshot('snap-1', 'wrong')).rejects.toThrow('snapshot-password-mismatch');
    expect(repository.resetAll).not.toHaveBeenCalled();
    expect(clearVaultIntegrityLedger).not.toHaveBeenCalled();
  });

  it('rejects an undecodable snapshot payload before resetting', async () => {
    decryptDataWithPasswordSecure.mockResolvedValue('{ not json');

    await expect(rebuildVaultFromSnapshot('snap-1', 'pass')).rejects.toThrow('snapshot-unreadable');
    expect(repository.resetAll).not.toHaveBeenCalled();
  });

  it('rebuilds the vault with the SAME password and repopulates from the snapshot', async () => {
    const result = await rebuildVaultFromSnapshot('snap-1', 'my-master-pass');

    expect(decryptDataWithPasswordSecure).toHaveBeenCalledWith('ciphertext', 'my-master-pass');
    // Reset first, then re-create under the same password, then write items.
    expect(repository.resetAll).toHaveBeenCalledTimes(1);
    // One argument on purpose: the rebuild path does not derive a key here, so
    // the first state goes out unsigned and is sealed by the very next write
    // (the item save below). Adding a derivation would widen the JS-side master
    // password surface for no practical gain.
    expect(repository.setupMaster).toHaveBeenCalledWith('my-master-pass');
    expect(repository.saveVaultItemsWithKey).toHaveBeenCalledWith(
      payload.items,
      expect.any(Uint8Array),
    );
    expect(importAttachments).toHaveBeenCalledWith(payload.attachments);
    expect(result).toEqual({ restoredItems: 2, restoredAttachments: 1, skippedSnapshots: 0 });
  });

  it('clears the integrity ledger with the vault so the new vault can be written', async () => {
    // Y-5: keeping the old high-water mark would make every post-rebuild write
    // look like a rollback and permanently block the recovered vault.
    await rebuildVaultFromSnapshot('snap-1', 'pass');

    expect(clearVaultIntegrityLedger).toHaveBeenCalledTimes(1);
  });

  it('closes the session it opened, even when the item write fails', async () => {
    repository.saveVaultItemsWithKey.mockRejectedValueOnce(new Error('disk full'));

    await expect(rebuildVaultFromSnapshot('snap-1', 'pass')).rejects.toThrow('disk full');
    expect(closeVaultSession).toHaveBeenCalled();
  });

  it('handles a snapshot with no attachments', async () => {
    validateBackupPayload.mockReturnValue({ items: payload.items, attachments: [] });

    const result = await rebuildVaultFromSnapshot('snap-1', 'pass');

    expect(importAttachments).not.toHaveBeenCalled();
    expect(result.restoredAttachments).toBe(0);
  });
});
