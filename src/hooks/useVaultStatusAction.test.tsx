/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { useVaultStatusAction } from './useVaultStatusAction';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useVaultStatusAction', () => {
  it('opens a success alert for the current vault status', () => {
    const openConfirm = vi.fn();
    const { result } = renderHook(() => useVaultStatusAction({ openConfirm }));

    act(() => result.current.openVaultStatus());

    expect(openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Kasa Durumu',
        type: 'success',
        isAlert: true,
      }),
    );
  });

  it('opens the vault status alert in the selected language', () => {
    localStorage.setItem(languageStorageKey, 'en');
    const openConfirm = vi.fn();
    const { result } = renderHook(() => useVaultStatusAction({ openConfirm }), {
      wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>,
    });

    act(() => result.current.openVaultStatus());

    expect(openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Vault Status',
        message: 'Vault status is current and fully protected. No leaks or weak links were detected.',
        type: 'success',
        isAlert: true,
      }),
    );
  });
});
