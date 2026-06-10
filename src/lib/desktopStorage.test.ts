// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDesktopRuntime,
  readDesktopVaultDatabase,
  resetDesktopVaultDatabase,
  writeDesktopVaultDatabase,
} from './desktopStorage';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe('desktopStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__TAURI_INTERNALS__;
  });

  it('skips Tauri commands in web runtime', async () => {
    expect(isDesktopRuntime()).toBe(false);
    await expect(readDesktopVaultDatabase()).resolves.toBeNull();
    await expect(writeDesktopVaultDatabase('payload')).resolves.toBe(false);
    await expect(resetDesktopVaultDatabase()).resolves.toBe(false);
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
});
