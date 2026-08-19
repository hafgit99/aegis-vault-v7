// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExtensionCredentials,
  EXTENSION_CREDENTIAL_LEASE_MS,
  getNativeVaultStorageScope,
  isAndroidRuntime,
  isDesktopRuntime,
  readDesktopVaultDatabase,
  resetDesktopVaultDatabase,
  syncExtensionCredentials,
  writeDesktopVaultDatabase,
} from './desktopStorage';
import type { VaultItem } from '../types';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const items: VaultItem[] = [
  {
    id: '1',
    title: 'Aegis Mail',
    username: 'ada@example.com',
    password: 'secret-pass',
    url: 'https://mail.example.com',
    category: 'login',
    createdAt: '2026-06-17',
    updatedAt: '2026-06-17',
  },
  {
    id: '2',
    title: 'Deleted',
    username: 'deleted@example.com',
    password: 'deleted-pass',
    url: 'https://deleted.example.com',
    category: 'login',
    createdAt: '2026-06-17',
    updatedAt: '2026-06-17',
    deleted: true,
  },
];

describe('desktopStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__TAURI_INTERNALS__;
  });

  it('skips native storage calls outside Tauri', async () => {
    expect(isDesktopRuntime()).toBe(false);
    expect(isAndroidRuntime()).toBe(false);
    expect(getNativeVaultStorageScope()).toBe('browser-fallback');
    await expect(readDesktopVaultDatabase()).resolves.toBeNull();
    await expect(writeDesktopVaultDatabase('payload')).resolves.toBe(false);
    await expect(resetDesktopVaultDatabase()).resolves.toBe(false);
    await syncExtensionCredentials(items);
    await clearExtensionCredentials();

    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes app data database commands in desktop runtime', async () => {
    window.__TAURI_INTERNALS__ = {};
    invoke.mockResolvedValueOnce('db-payload').mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    expect(isDesktopRuntime()).toBe(true);
    expect(isAndroidRuntime()).toBe(false);
    expect(getNativeVaultStorageScope()).toBe('desktop-app-data');
    await expect(readDesktopVaultDatabase()).resolves.toBe('db-payload');
    await expect(writeDesktopVaultDatabase('payload')).resolves.toBe(true);
    await expect(resetDesktopVaultDatabase()).resolves.toBe(true);

    expect(invoke).toHaveBeenNthCalledWith(1, 'read_vault_database');
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_vault_database', { contents: 'payload' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'reset_vault_database');
  });

  it('treats Android Tauri WebView storage as app-private native persistence', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 14; Aegis Vault) AppleWebKit/537.36',
    );
    invoke.mockResolvedValueOnce('android-db-payload').mockResolvedValueOnce(undefined);

    expect(isDesktopRuntime()).toBe(true);
    expect(isAndroidRuntime()).toBe(true);
    expect(getNativeVaultStorageScope()).toBe('android-app-private');
    await expect(readDesktopVaultDatabase()).resolves.toBe('android-db-payload');
    await expect(writeDesktopVaultDatabase('android-payload')).resolves.toBe(true);

    expect(invoke).toHaveBeenNthCalledWith(1, 'read_vault_database');
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_vault_database', { contents: 'android-payload' });
  });

  it('syncs extension credentials with a short native lease', async () => {
    window.__TAURI_INTERNALS__ = {};

    expect(EXTENSION_CREDENTIAL_LEASE_MS).toBe(300000);
    await syncExtensionCredentials(items);

    expect(invoke).toHaveBeenCalledWith('sync_extension_credentials', {
      ttlMs: EXTENSION_CREDENTIAL_LEASE_MS,
      credentials: [
        {
          id: '1',
          title: 'Aegis Mail',
          username: 'ada@example.com',
          password: 'secret-pass',
          url: 'https://mail.example.com',
          category: 'login',
          favorite: false,
        },
      ],
    });
  });

  it('syncs extension credentials with card fallbacks and a custom lease', async () => {
    window.__TAURI_INTERNALS__ = {};
    const cardItem: VaultItem = {
      id: 'card-1',
      title: 'Card',
      username: '',
      password: '',
      cardholderName: 'Ada Lovelace',
      cardNumber: '4111111111111111',
      url: '',
      category: 'card',
      favorite: true,
      createdAt: '2026-06-17',
      updatedAt: '2026-06-17',
    };

    await syncExtensionCredentials([cardItem], 1000);

    expect(invoke).toHaveBeenCalledWith('sync_extension_credentials', {
      ttlMs: 1000,
      credentials: [expect.objectContaining({
        username: 'Ada Lovelace',
        password: '4111111111111111',
        url: '',
        favorite: true,
      })],
    });
  });

  it('fails closed when extension sync commands throw', async () => {
    window.__TAURI_INTERNALS__ = {};
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    invoke.mockRejectedValueOnce(new Error('sync failed')).mockRejectedValueOnce(new Error('clear failed'));

    await syncExtensionCredentials(items);
    await clearExtensionCredentials();

    expect(errorSpy).toHaveBeenNthCalledWith(1, 'Failed to sync credentials to extension:', expect.any(Error));
    expect(errorSpy).toHaveBeenNthCalledWith(2, 'Failed to clear extension credentials:', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('clears extension credentials through the native bridge', async () => {
    window.__TAURI_INTERNALS__ = {};

    await clearExtensionCredentials();

    expect(invoke).toHaveBeenCalledWith('clear_extension_credentials');
  });

  it('runs desktop setupMasterPassword, verifyMasterPassword and changeMasterPassword', async () => {
    window.__TAURI_INTERNALS__ = {};
    const {
      setupMasterPasswordWithSecretKey,
      verifyMasterPassword,
      changeMasterPassword,
    } = await import('./storage');
    const {
      hasActiveMasterPassword,
      closeVaultSession,
    } = await import('./vaultSession');

    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'setup_rust_session') {
        return {
          vaultEncryptionKey: Array.from(new Uint8Array(32).fill(5)),
          argonHash: '$argon2id$mock-setup',
          salt: 'mock-salt-12345678',
        };
      }
      if (cmd === 'open_rust_session') {
        return Array.from(new Uint8Array(32).fill(5));
      }
      if (cmd === 'rotate_rust_session') {
        return {
          newVaultKey: Array.from(new Uint8Array(32).fill(6)),
          newArgonHash: '$argon2id$mock-rotated',
        };
      }
      return undefined;
    });

    // 1. Setup
    const secretKey = 'A3-TEST1-TEST2-TEST3-TEST4-TEST5-TEST6';
    await setupMasterPasswordWithSecretKey('desktop-master-pass', secretKey, true);
    expect(hasActiveMasterPassword()).toBe(true);

    // 2. Change password
    await changeMasterPassword('desktop-master-pass', 'desktop-new-master-1234');
    expect(hasActiveMasterPassword()).toBe(true);

    // 3. Verify
    closeVaultSession();
    const verified = await verifyMasterPassword('desktop-new-master-1234', secretKey);
    expect(verified).toBe(true);
    expect(hasActiveMasterPassword()).toBe(true);

    closeVaultSession();
  });
});
