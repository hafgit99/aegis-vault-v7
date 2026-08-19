/**
 * @vitest-environment jsdom
 */

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getVaultItems, reseedDemoData, resetSystem } from '../lib/storage';
import { LanguageProvider } from '../i18n/LanguageContext';
import { useSettingsVaultItems } from './useSettingsVaultItems';
import type { ReactNode } from 'react';
import type { VaultItem } from '../types';

const vaultItems: VaultItem[] = [
  {
    id: 'github',
    title: 'GitHub',
    username: 'hafgit99',
    password: 'secret-password',
    url: 'https://github.com',
    notes: '',
    createdAt: '2026-06-10',
    updatedAt: '2026-06-10',
    category: 'login',
  },
];

vi.mock('../lib/storage', () => ({
  getVaultItems: vi.fn(),
  reseedDemoData: vi.fn(),
  resetSystem: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}

beforeEach(() => {
  vi.mocked(getVaultItems).mockResolvedValue(vaultItems);
  vi.mocked(reseedDemoData).mockResolvedValue(vaultItems);
  vi.mocked(resetSystem).mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('useSettingsVaultItems', () => {
  it('loads vault items on mount', async () => {
    const { result } = renderHook(
      () => useSettingsVaultItems({ onDatabaseChanged: vi.fn() }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(vaultItems);
    });
  });

  it('reseeds demo data and notifies the caller', async () => {
    const onDatabaseChanged = vi.fn();
    const onNotify = vi.fn();
    const { result } = renderHook(
      () => useSettingsVaultItems({ onDatabaseChanged, onNotify }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.items).toEqual(vaultItems);
    });

    result.current.triggerReseed();

    await waitFor(() => {
      expect(reseedDemoData).toHaveBeenCalledTimes(1);
      expect(onDatabaseChanged).toHaveBeenCalledTimes(1);
      expect(onNotify).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success' }),
      );
    });
  });

  it('does not reset the vault when the destructive confirmation is cancelled', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    const { result } = renderHook(
      () => useSettingsVaultItems({ onDatabaseChanged: vi.fn() }),
      { wrapper },
    );

    result.current.triggerResetAll();

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(resetSystem).not.toHaveBeenCalled();
  });

  it('resets the vault when the destructive confirmation is accepted', () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(resetSystem).mockImplementationOnce(() => new Promise(() => {}));
    const reload = vi.fn();
    const originalReload = window.location.reload;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    });
    const { result } = renderHook(
      () => useSettingsVaultItems({ onDatabaseChanged: vi.fn() }),
      { wrapper },
    );

    result.current.triggerResetAll();

    expect(resetSystem).toHaveBeenCalledTimes(1);
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: window.location,
    });
    void originalReload;
  });
});
