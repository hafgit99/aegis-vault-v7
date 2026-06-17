// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearExtensionCredentials,
  EXTENSION_CREDENTIAL_LEASE_MS,
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
    await expect(readDesktopVaultDatabase()).resolves.toBe('db-payload');
    await expect(writeDesktopVaultDatabase('payload')).resolves.toBe(true);
    await expect(resetDesktopVaultDatabase()).resolves.toBe(true);

    expect(invoke).toHaveBeenNthCalledWith(1, 'read_vault_database');
    expect(invoke).toHaveBeenNthCalledWith(2, 'write_vault_database', { contents: 'payload' });
    expect(invoke).toHaveBeenNthCalledWith(3, 'reset_vault_database');
  });

  it('syncs extension credentials with a short native lease', async () => {
    window.__TAURI_INTERNALS__ = {};

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

  it('clears extension credentials through the native bridge', async () => {
    window.__TAURI_INTERNALS__ = {};

    await clearExtensionCredentials();

    expect(invoke).toHaveBeenCalledWith('clear_extension_credentials');
  });
});
