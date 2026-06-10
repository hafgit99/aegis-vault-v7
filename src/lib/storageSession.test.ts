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
  getVaultItems,
  resetSystem,
  setupMasterPassword,
  verifyMasterPassword,
} from './storage';
import { closeVaultSession, getActiveMasterPassword, openVaultSession } from './vaultSession';

afterEach(() => {
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

  it('opens an in-memory session after a successful password verification', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);

    await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

    expect(getActiveMasterPassword()).toBe('master-pass');
    expect(migrateLegacyAttachmentsToAesGcm).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('aegis_session_master_pass')).toBeNull();
  });

  it('keeps a successful unlock when legacy attachment migration fails', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);
    migrateLegacyAttachmentsToAesGcm.mockRejectedValueOnce(new Error('migration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

      expect(getActiveMasterPassword()).toBe('master-pass');
      expect(warnSpy).toHaveBeenCalledWith(
        'Legacy attachment migration failed after unlock:',
        expect.any(Error),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('uses the active in-memory session for vault reads', () => {
    openVaultSession('master-pass');

    getVaultItems();

    expect(sqliteOPFSInstance.getVaultItems).toHaveBeenCalledWith('master-pass');
  });

  it('clears the in-memory session when the system is reset', () => {
    openVaultSession('master-pass');

    resetSystem();

    expect(getActiveMasterPassword()).toBeNull();
  });
});
