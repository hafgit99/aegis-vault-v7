/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const sqliteOPFSInstance = vi.hoisted(() => ({
  deletePermanently: vi.fn(),
  deletePermanentlyBatch: vi.fn(),
  getVaultItems: vi.fn(() => []),
  hydrate: vi.fn(async () => undefined),
  reseedDemo: vi.fn(),
  resetAll: vi.fn(),
  changeMasterPassword: vi.fn(async () => undefined),
  saveVaultItem: vi.fn(),
  saveVaultItems: vi.fn(),
  setupMaster: vi.fn(async () => undefined),
  verifyPassword: vi.fn(),
}));

const migrateLegacyAttachmentsToAesGcm = vi.hoisted(() => vi.fn(async () => 0));
const reencryptAttachmentsForMasterPasswordChange = vi.hoisted(() => vi.fn(async () => 0));
const disableBiometric = vi.hoisted(() => vi.fn());
const hydrateBiometric = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('./sqlite_opfs', () => ({
  sqliteOPFSInstance,
}));

vi.mock('./attachments', () => ({
  migrateLegacyAttachmentsToAesGcm,
  reencryptAttachmentsForMasterPasswordChange,
}));

vi.mock('./biometric', () => ({
  disableBiometric,
  hydrateBiometric,
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
  changeMasterPassword,
  setupMasterPassword,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
  initializeStorage,
  rememberAccountSecretKey,
  forgetRememberedAccountSecretKey,
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
  delete window.AegisAndroidSecureStorage;
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('vault session storage', () => {
  it('initializes sqlite, biometric state, and secure-storage migration in order', async () => {
    const secureValues = new Map<string, string>();
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };
    localStorage.setItem('aegis_account_secret_key_remembered', 'A3-LEGACY-SECRET');

    await initializeStorage();

    expect(sqliteOPFSInstance.hydrate).toHaveBeenCalledTimes(1);
    expect(hydrateBiometric).toHaveBeenCalledTimes(1);
    expect(window.AegisAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'aegis_account_secret_key_remembered',
      'A3-LEGACY-SECRET',
    );
    expect(localStorage.getItem('aegis_account_secret_key_remembered')).toBeNull();
  });

  it('opens an in-memory session during setup without writing the master password to sessionStorage', async () => {
    await setupMasterPassword('master-pass');

    expect(sqliteOPFSInstance.setupMaster).toHaveBeenCalledWith('master-pass');
    expect(getActiveMasterPassword()).toBe('master-pass');
    expect(sessionStorage.getItem('aegis_session_master_pass')).toBeNull();
    expect(localStorage.getItem('aegis_is_setup')).toBe('true');
    expect(sqliteOPFSInstance.reseedDemo).toHaveBeenCalledWith(
      'master-pass',
      expect.arrayContaining([expect.objectContaining({ id: '1', title: 'Demo Developer Portal' })]),
    );
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
    expect(localStorage.getItem('aegis_is_setup')).toBe('true');
    expect(sqliteOPFSInstance.reseedDemo).toHaveBeenCalledWith(
      'aegis-vault-v7:master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      expect.arrayContaining([expect.objectContaining({ id: '1', title: 'Demo Developer Portal' })]),
    );
  });

  it('normalizes remembered secret keys and falls back to localStorage when secure storage rejects writes', () => {
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => false),
      removeItem: vi.fn(() => false),
    };

    rememberAccountSecretKey('  a3-abcd-efgh-ijkl-mnop-qrst-uvwx-yz23-4567  ');

    expect(window.AegisAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'aegis_account_secret_key_remembered',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(localStorage.getItem('aegis_account_secret_key_remembered')).toBe(
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(getRememberedAccountSecretKey()).toBe('A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567');
  });

  it('removes remembered secret keys from both secure storage and the legacy fallback', () => {
    const secureValues = new Map<string, string>([[
      'aegis_account_secret_key_remembered',
      'A3-SECURE-SECRET',
    ]]);
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };
    localStorage.setItem('aegis_account_secret_key_remembered', 'A3-LEGACY-SECRET');

    forgetRememberedAccountSecretKey();

    expect(window.AegisAndroidSecureStorage.removeItem).toHaveBeenCalledWith(
      'aegis_account_secret_key_remembered',
    );
    expect(localStorage.getItem('aegis_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBeNull();
  });

  it('stores remembered secret keys in Android secure storage when the bridge is available', async () => {
    const secureValues = new Map<string, string>();
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };

    await setupMasterPasswordWithSecretKey(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      true,
    );

    expect(window.AegisAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'aegis_account_secret_key_remembered',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(localStorage.getItem('aegis_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBe('A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567');
  });

  it('migrates legacy remembered secret keys into Android secure storage during initialization', async () => {
    const secureValues = new Map<string, string>();
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };
    localStorage.setItem('aegis_account_secret_key_remembered', 'A3-LEGACY-SECRET');
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(false);

    await verifyMasterPassword('wrong-pass');

    expect(window.AegisAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'aegis_account_secret_key_remembered',
      'A3-LEGACY-SECRET',
    );
    expect(localStorage.getItem('aegis_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBe('A3-LEGACY-SECRET');
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

  it('rotates the master password without reseeding or wiping vault items', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);

    await changeMasterPassword('old-master-pass', 'new-master-pass-12');

    expect(reencryptAttachmentsForMasterPasswordChange).toHaveBeenCalledWith(
      'old-master-pass',
      'new-master-pass-12',
    );
    expect(sqliteOPFSInstance.changeMasterPassword).toHaveBeenCalledWith(
      'old-master-pass',
      'new-master-pass-12',
    );
    expect(sqliteOPFSInstance.reseedDemo).not.toHaveBeenCalled();
    expect(getActiveMasterPassword()).toBe('new-master-pass-12');
    expect(getActiveBackupPassword()).toBe('new-master-pass-12');
  });

  it('rotates only the master password portion for secret-key protected vaults', async () => {
    localStorage.setItem('aegis_account_secret_profile', JSON.stringify({
      enabled: true,
      fingerprint: '3456-7',
    }));
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    openVaultSession(
      'aegis-vault-v7:old-master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      'old-master-pass',
    );

    await changeMasterPassword('old-master-pass', 'new-master-pass-12');

    const newCredential = 'aegis-vault-v7:new-master-pass-12\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567';
    expect(sqliteOPFSInstance.changeMasterPassword).toHaveBeenCalledWith(
      'aegis-vault-v7:old-master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      newCredential,
    );
    expect(getActiveMasterPassword()).toBe(newCredential);
    expect(getActiveBackupPassword()).toBe('new-master-pass-12');
  });

  it('rolls attachment encryption back when vault password rotation fails', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    sqliteOPFSInstance.changeMasterPassword.mockRejectedValueOnce(new Error('db failed'));
    reencryptAttachmentsForMasterPasswordChange.mockResolvedValueOnce(2).mockResolvedValueOnce(2);

    await expect(changeMasterPassword('old-master-pass', 'new-master-pass-12')).rejects.toThrow('db failed');

    expect(reencryptAttachmentsForMasterPasswordChange).toHaveBeenNthCalledWith(
      1,
      'old-master-pass',
      'new-master-pass-12',
    );
    expect(reencryptAttachmentsForMasterPasswordChange).toHaveBeenNthCalledWith(
      2,
      'new-master-pass-12',
      'old-master-pass',
    );
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
        severity: 'warning',
        source: 'AegisSecurity',
        meta: expect.objectContaining({ error: 'migration failed' }),
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


  it('does not treat empty or malformed fallback user secret arrays as setup', () => {
    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify({ user_secrets: [] }));
    expect(isMasterPasswordSet()).toBe(false);

    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify({ user_secrets: null }));
    expect(isMasterPasswordSet()).toBe(false);

    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify({ records: [{ id: 'secret' }] }));
    expect(isMasterPasswordSet()).toBe(false);
  });

  it('returns empty lists for mutating wrappers when no vault session is active', async () => {
    await expect(saveVaultItem(sampleItem())).resolves.toEqual([]);
    await expect(deleteVaultItem('item-1')).resolves.toEqual([]);
    await expect(moveToTrash('item-1')).resolves.toEqual([]);
    await expect(restoreFromTrash('item-1')).resolves.toEqual([]);
    await expect(deletePermanently('item-1')).resolves.toEqual([]);
    await expect(saveVaultItems([sampleItem()], vi.fn())).resolves.toEqual([]);
    await expect(emptyTrashComplete()).resolves.toEqual([]);
    await expect(reseedDemoData()).resolves.toEqual([]);

    expect(sqliteOPFSInstance.saveVaultItem).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
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
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([activeItem, recentTrash, expiredTrash]);
    sqliteOPFSInstance.deletePermanentlyBatch.mockResolvedValueOnce([activeItem, recentTrash]);
    openVaultSession('master-pass');

    await expect(getVaultItems()).resolves.toEqual([activeItem, recentTrash]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).toHaveBeenCalledWith(['expired-trash'], 'master-pass');
    expect(sqliteOPFSInstance.getVaultItems).toHaveBeenCalledTimes(1);
  });

  it('empties only deleted items from trash', async () => {
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([
      sampleItem({ id: 'active-item' }),
      sampleItem({ id: 'trash-1', deleted: true }),
      sampleItem({ id: 'trash-2', deleted: true }),
    ]);
    sqliteOPFSInstance.deletePermanentlyBatch.mockResolvedValueOnce([sampleItem({ id: 'active-item' })]);
    openVaultSession('master-pass');

    await expect(emptyTrashComplete()).resolves.toEqual([sampleItem({ id: 'active-item' })]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).toHaveBeenCalledWith(['trash-1', 'trash-2'], 'master-pass');
  });

  it('passes the active session password to saveVaultItems bulk save wrapper', async () => {
    const item = sampleItem();
    sqliteOPFSInstance.saveVaultItems.mockResolvedValue([item]);
    openVaultSession('master-pass');

    await expect(saveVaultItems([item])).resolves.toEqual([item]);

    expect(sqliteOPFSInstance.saveVaultItems).toHaveBeenCalledWith([item], 'master-pass');
  });

  it('returns database-normalized records from the bulk save wrapper', async () => {
    const importedItem = sampleItem({ id: '', title: '' });
    const normalizedItem = sampleItem({
      id: 'generated-id',
      title: 'Imported Record',
      createdAt: '2026-06-26',
      updatedAt: '2026-06-26',
    });
    sqliteOPFSInstance.saveVaultItems.mockResolvedValueOnce([normalizedItem]);
    openVaultSession('master-pass');

    await expect(saveVaultItems([importedItem])).resolves.toEqual([normalizedItem]);

    expect(sqliteOPFSInstance.saveVaultItems).toHaveBeenCalledWith([importedItem], 'master-pass');
  });

  it('ignores missing, disabled, or malformed account secret-key profiles', () => {
    expect(isAccountSecretKeyRequired()).toBe(false);

    localStorage.setItem('aegis_account_secret_profile', JSON.stringify({ enabled: false, fingerprint: '3456-7' }));
    expect(isAccountSecretKeyRequired()).toBe(false);

    localStorage.setItem('aegis_account_secret_profile', '{not json');
    expect(isAccountSecretKeyRequired()).toBe(false);
  });

  it('falls back to the raw master password when a secret-key profile has no usable key', async () => {
    localStorage.setItem('aegis_account_secret_profile', JSON.stringify({
      enabled: true,
      fingerprint: '3456-7',
    }));
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);

    await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

    expect(sqliteOPFSInstance.verifyPassword).toHaveBeenCalledWith('master-pass');
    expect(getActiveMasterPassword()).toBe('master-pass');
  });

  it('accepts already combined credentials while keeping the raw master password as backup', async () => {
    const combinedCredential = 'aegis-vault-v7:master-pass\nA3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567';
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);

    await expect(verifyMasterPassword(combinedCredential)).resolves.toBe(true);

    expect(sqliteOPFSInstance.verifyPassword).toHaveBeenCalledWith(combinedCredential);
    expect(getActiveMasterPassword()).toBe(combinedCredential);
    expect(getActiveBackupPassword()).toBe('master-pass');
  });

  it('does not open a vault session after failed verification', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(false);

    await expect(verifyMasterPassword('wrong-pass')).resolves.toBe(false);

    expect(getActiveMasterPassword()).toBeNull();
    expect(migrateLegacyAttachmentsToAesGcm).not.toHaveBeenCalled();
  });

  it('keeps setup successful when legacy attachment migration fails', async () => {
    migrateLegacyAttachmentsToAesGcm.mockRejectedValueOnce(new Error('setup migration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(setupMasterPassword('master-pass')).resolves.toBeUndefined();

      expect(sqliteOPFSInstance.setupMaster).toHaveBeenCalledWith('master-pass');
      expect(localStorage.getItem('aegis_is_setup')).toBe('true');
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'attachment.legacyMigration.failed',
        severity: 'warning',
        source: 'AegisSecurity',
        meta: expect.objectContaining({ error: 'setup migration failed' }),
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });


  it('keeps secret-key setup successful when legacy attachment migration fails', async () => {
    migrateLegacyAttachmentsToAesGcm.mockRejectedValueOnce(new Error('secret setup migration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(setupMasterPasswordWithSecretKey(
        'master-pass',
        'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
        false,
      )).resolves.toBeUndefined();

      expect(localStorage.getItem('aegis_is_setup')).toBe('true');
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'attachment.legacyMigration.failed',
        severity: 'warning',
        source: 'AegisSecurity',
        meta: expect.objectContaining({ error: 'secret setup migration failed' }),
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('forgets any remembered secret key when setup chooses not to remember this device', async () => {
    localStorage.setItem('aegis_account_secret_key_remembered', 'A3-OLD-SECRET');

    await setupMasterPasswordWithSecretKey(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      false,
    );

    expect(localStorage.getItem('aegis_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBeNull();
  });

  it('rejects master password rotation when the current password is invalid', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(false);

    await expect(changeMasterPassword('wrong-pass', 'new-master-pass-12')).rejects.toThrow(
      'current-master-password-invalid',
    );

    expect(reencryptAttachmentsForMasterPasswordChange).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.changeMasterPassword).not.toHaveBeenCalled();
  });

  it('does not roll attachment encryption back when no attachments were rotated', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    reencryptAttachmentsForMasterPasswordChange.mockResolvedValueOnce(0);
    sqliteOPFSInstance.changeMasterPassword.mockRejectedValueOnce(new Error('db failed'));

    await expect(changeMasterPassword('old-master-pass', 'new-master-pass-12')).rejects.toThrow('db failed');

    expect(reencryptAttachmentsForMasterPasswordChange).toHaveBeenCalledTimes(1);
    expect(reencryptAttachmentsForMasterPasswordChange).toHaveBeenCalledWith(
      'old-master-pass',
      'new-master-pass-12',
    );
  });

  it('removes setup, fallback, and secret-key markers when the vault is reset', async () => {
    localStorage.setItem('aegis_is_setup', 'true');
    localStorage.setItem('aegis_sqlite_fallback', '{"user_secrets":[{}]}');
    localStorage.setItem('aegis_account_secret_profile', '{"enabled":true}');
    localStorage.setItem('aegis_account_secret_key_remembered', 'A3-OLD-SECRET');
    openVaultSession('master-pass');

    await resetSystem();

    expect(sqliteOPFSInstance.resetAll).toHaveBeenCalledTimes(1);
    expect(getActiveMasterPassword()).toBeNull();
    expect(localStorage.getItem('aegis_is_setup')).toBeNull();
    expect(localStorage.getItem('aegis_sqlite_fallback')).toBeNull();
    expect(localStorage.getItem('aegis_account_secret_profile')).toBeNull();
    expect(localStorage.getItem('aegis_account_secret_key_remembered')).toBeNull();
  });

  it('returns an empty item list when reads happen without an active session', async () => {
    await expect(getVaultItems()).resolves.toEqual([]);

    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
  });

  it('returns active vault items unchanged when no trash cleanup is needed', async () => {
    const activeItem = sampleItem({ id: 'active-item' });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([activeItem]);
    openVaultSession('master-pass');

    await expect(getVaultItems()).resolves.toEqual([activeItem]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).not.toHaveBeenCalled();
  });

  it('treats trash items at the exact retention boundary as expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const boundaryTrash = sampleItem({
      id: 'boundary-trash',
      deleted: true,
      deletedAt: '2026-01-17T00:00:00.000Z',
    });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([boundaryTrash]);
    sqliteOPFSInstance.deletePermanentlyBatch.mockResolvedValueOnce([]);
    openVaultSession('master-pass');

    await expect(getVaultItems()).resolves.toEqual([]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).toHaveBeenCalledWith(['boundary-trash'], 'master-pass');
  });

  it('keeps trash items younger than the retention window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const recentTrash = sampleItem({
      id: 'recent-trash',
      deleted: true,
      deletedAt: '2026-01-17T00:01:00.000Z',
    });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([recentTrash]);
    openVaultSession('master-pass');

    await expect(getVaultItems()).resolves.toEqual([recentTrash]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).not.toHaveBeenCalled();
  });

  it('passes progress callbacks through the bulk save wrapper', async () => {
    const item = sampleItem();
    const onProgress = vi.fn();
    sqliteOPFSInstance.saveVaultItems.mockResolvedValueOnce([item]);
    openVaultSession('master-pass');

    await expect(saveVaultItems([item], onProgress)).resolves.toEqual([item]);

    expect(sqliteOPFSInstance.saveVaultItems).toHaveBeenCalledWith([item], 'master-pass', onProgress);
  });

  it('returns existing items when empty trash has no deleted entries', async () => {
    const activeItem = sampleItem({ id: 'active-item' });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([activeItem]);
    openVaultSession('master-pass');

    await expect(emptyTrashComplete()).resolves.toEqual([activeItem]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).not.toHaveBeenCalled();
  });

});
