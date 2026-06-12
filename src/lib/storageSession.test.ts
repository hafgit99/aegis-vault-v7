/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const sqliteOPFSInstance = vi.hoisted(() => ({
  deletePermanently: vi.fn(),
  getVaultItems: vi.fn(() => []),
  hydrate: vi.fn(async () => undefined),
  reseedDemo: vi.fn(),
  resetAll: vi.fn(),
  saveVaultItem: vi.fn(),
  saveVaultItems: vi.fn(),
  setupMaster: vi.fn(async () => undefined),
  verifyPassword: vi.fn(),
}));

const migrateLegacyAttachmentsToAesGcm = vi.hoisted(() => vi.fn(async () => 0));

vi.mock('./sqlite_opfs', () => ({
  sqliteOPFSInstance,
}));

vi.mock('./attachments', () => ({
  migrateLegacyAttachmentsToAesGcm,
}));

import {
  deletePermanently,
  deleteVaultItem,
  emptyTrashComplete,
  getVaultItems,
  getRememberedAccountSecretKey,
  isAccountSecretKeyRequired,
  isMasterPasswordSet,
  moveToTrash,
  reseedDemoData,
  resetSystem,
  restoreFromTrash,
  saveVaultItem,
  saveVaultItems,
  setupMasterPassword,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
} from './storage';
import { closeVaultSession, getActiveBackupPassword, getActiveMasterPassword, openVaultSession } from './vaultSession';
import type { VaultItem } from '../types';

function sampleItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Email',
    username: 'ada',
    password: 'secret',
    url: 'https://example.test',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    category: 'login',
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  closeVaultSession();
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('vault session storage', () => {
  it('opens an in-memory session during setup without writing the master password to sessionStorage', async () => {
    await setupMasterPassword('master-pass');

    expect(sqliteOPFSInstance.setupMaster).toHaveBeenCalledWith('master-pass');
    expect(getActiveMasterPassword()).toBe('master-pass');
    expect(sessionStorage.getItem('aegis_session_master_pass')).toBeNull();
  });

  it('sets up a secret-key protected vault and can remember the second key locally', async () => {
    await setupMasterPasswordWithSecretKey(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      true,
    );

    expect(sqliteOPFSInstance.setupMaster).toHaveBeenCalledWith(
      'aegis-vault-v7:master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(isAccountSecretKeyRequired()).toBe(true);
    expect(getRememberedAccountSecretKey()).toBe('A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567');
    expect(getActiveMasterPassword()).toBe(
      'aegis-vault-v7:master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(getActiveBackupPassword()).toBe('master-pass');
  });

  it('opens an in-memory session after a successful password verification', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);

    await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

    expect(getActiveMasterPassword()).toBe('master-pass');
    expect(migrateLegacyAttachmentsToAesGcm).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('aegis_session_master_pass')).toBeNull();
  });

  it('verifies secret-key protected vaults with the combined credential', async () => {
    localStorage.setItem('aegis_account_secret_profile', JSON.stringify({
      enabled: true,
      fingerprint: '3456-7',
    }));
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);

    await expect(verifyMasterPassword(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    )).resolves.toBe(true);

    expect(sqliteOPFSInstance.verifyPassword).toHaveBeenCalledWith(
      'aegis-vault-v7:master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(getActiveMasterPassword()).toBe(
      'aegis-vault-v7:master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(getActiveBackupPassword()).toBe('master-pass');
  });

  it('keeps a successful unlock when legacy attachment migration fails', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);
    migrateLegacyAttachmentsToAesGcm.mockRejectedValueOnce(new Error('migration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

      expect(getActiveMasterPassword()).toBe('master-pass');
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'attachment.legacyMigration.failed',
        source: 'AegisSecurity',
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('uses the active in-memory session for vault reads', () => {
    openVaultSession('master-pass');

    getVaultItems();

    expect(sqliteOPFSInstance.getVaultItems).toHaveBeenCalledWith('master-pass');
  });

  it('clears the in-memory session when the system is reset', async () => {
    openVaultSession('master-pass');

    await resetSystem();

    expect(getActiveMasterPassword()).toBeNull();
  });

  it('detects setup from the versioned sqlite fallback before using the legacy setup flag', () => {
    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify({
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$hash' }],
    }));

    expect(isMasterPasswordSet()).toBe(true);

    localStorage.setItem('aegis_sqlite_fallback', '{not json');
    expect(isMasterPasswordSet()).toBe(false);

    localStorage.setItem('aegis_is_setup', 'true');
    expect(isMasterPasswordSet()).toBe(true);
  });

  it('returns empty lists for mutating wrappers when no vault session is active', async () => {
    await expect(saveVaultItem(sampleItem())).resolves.toEqual([]);
    await expect(deleteVaultItem('item-1')).resolves.toEqual([]);
    await expect(moveToTrash('item-1')).resolves.toEqual([]);
    await expect(restoreFromTrash('item-1')).resolves.toEqual([]);
    await expect(deletePermanently('item-1')).resolves.toEqual([]);
    await expect(emptyTrashComplete()).resolves.toEqual([]);
    await expect(reseedDemoData()).resolves.toEqual([]);

    expect(sqliteOPFSInstance.saveVaultItem).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.deletePermanently).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.reseedDemo).not.toHaveBeenCalled();
  });

  it('passes the active session password to save, delete, and reseed wrappers', async () => {
    const item = sampleItem();
    sqliteOPFSInstance.saveVaultItem.mockResolvedValue([item]);
    sqliteOPFSInstance.deletePermanently.mockResolvedValue([]);
    sqliteOPFSInstance.reseedDemo.mockResolvedValue([item]);
    openVaultSession('master-pass');

    await expect(saveVaultItem(item)).resolves.toEqual([item]);
    await expect(deleteVaultItem('item-1')).resolves.toEqual([]);
    await expect(deletePermanently('item-1')).resolves.toEqual([]);
    await expect(reseedDemoData()).resolves.toEqual([item]);

    expect(sqliteOPFSInstance.saveVaultItem).toHaveBeenCalledWith(item, 'master-pass');
    expect(sqliteOPFSInstance.deletePermanently).toHaveBeenNthCalledWith(1, 'item-1', 'master-pass');
    expect(sqliteOPFSInstance.deletePermanently).toHaveBeenNthCalledWith(2, 'item-1', 'master-pass');
    expect(sqliteOPFSInstance.reseedDemo).toHaveBeenCalledWith('master-pass', expect.arrayContaining([
      expect.objectContaining({ id: '1', title: 'Demo Developer Portal' }),
    ]));
  });

  it('moves items to trash and restores them through saveVaultItem', async () => {
    const activeItem = sampleItem();
    sqliteOPFSInstance.getVaultItems.mockResolvedValue([activeItem]);
    sqliteOPFSInstance.saveVaultItem.mockResolvedValue([activeItem]);
    openVaultSession('master-pass');

    await moveToTrash('item-1');

    expect(sqliteOPFSInstance.saveVaultItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'item-1',
        deleted: true,
        deletedAt: expect.any(String),
      }),
      'master-pass',
    );

    const trashedItem = sampleItem({ deleted: true, deletedAt: '2026-01-10T00:00:00.000Z' });
    sqliteOPFSInstance.getVaultItems.mockResolvedValue([trashedItem]);

    await restoreFromTrash('item-1');

    expect(sqliteOPFSInstance.saveVaultItem).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ deletedAt: expect.anything() }),
      'master-pass',
    );
    expect(sqliteOPFSInstance.saveVaultItem).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'item-1', deleted: false }),
      'master-pass',
    );
  });

  it('leaves trash wrappers as read-only when the target item is missing', async () => {
    sqliteOPFSInstance.getVaultItems.mockResolvedValue([sampleItem({ id: 'other-item' })]);
    openVaultSession('master-pass');

    await moveToTrash('missing-item');
    await restoreFromTrash('missing-item');

    expect(sqliteOPFSInstance.saveVaultItem).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.getVaultItems).toHaveBeenCalledTimes(4);
  });

  it('permanently removes expired trash entries during reads', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const activeItem = sampleItem({ id: 'active-item' });
    const recentTrash = sampleItem({
      id: 'recent-trash',
      deleted: true,
      deletedAt: '2026-01-25T00:00:00.000Z',
    });
    const expiredTrash = sampleItem({
      id: 'expired-trash',
      deleted: true,
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    sqliteOPFSInstance.getVaultItems
      .mockResolvedValueOnce([activeItem, recentTrash, expiredTrash])
      .mockResolvedValueOnce([activeItem, recentTrash]);
    openVaultSession('master-pass');

    await expect(getVaultItems()).resolves.toEqual([activeItem, recentTrash]);

    expect(sqliteOPFSInstance.deletePermanently).toHaveBeenCalledWith('expired-trash', 'master-pass');
    expect(sqliteOPFSInstance.getVaultItems).toHaveBeenCalledTimes(2);
  });

  it('empties only deleted items from trash', async () => {
    sqliteOPFSInstance.getVaultItems
      .mockResolvedValueOnce([
        sampleItem({ id: 'active-item' }),
        sampleItem({ id: 'trash-1', deleted: true }),
        sampleItem({ id: 'trash-2', deleted: true }),
      ])
      .mockResolvedValueOnce([sampleItem({ id: 'active-item' })]);
    openVaultSession('master-pass');

    await expect(emptyTrashComplete()).resolves.toEqual([sampleItem({ id: 'active-item' })]);

    expect(sqliteOPFSInstance.deletePermanently).toHaveBeenCalledTimes(2);
    expect(sqliteOPFSInstance.deletePermanently).toHaveBeenNthCalledWith(1, 'trash-1', 'master-pass');
    expect(sqliteOPFSInstance.deletePermanently).toHaveBeenNthCalledWith(2, 'trash-2', 'master-pass');
  });

  it('passes the active session password to saveVaultItems bulk save wrapper', async () => {
    const item = sampleItem();
    sqliteOPFSInstance.saveVaultItems.mockResolvedValue([item]);
    openVaultSession('master-pass');

    await expect(saveVaultItems([item])).resolves.toEqual([item]);

    expect(sqliteOPFSInstance.saveVaultItems).toHaveBeenCalledWith([item], 'master-pass');
  });
});
