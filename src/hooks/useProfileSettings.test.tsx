/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { useProfileSettings } from './useProfileSettings';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useProfileSettings', () => {
  it('loads default profile settings when storage is empty', () => {
    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.profileName).toBe('Aegis Kullanıcısı');
    expect(result.current.profileAvatar).toContain('https://lh3.googleusercontent.com/');
    expect(result.current.isProfileModalOpen).toBe(false);
  });

  it('hydrates profile settings from localStorage', () => {
    localStorage.setItem('profile_name', 'Ada');
    localStorage.setItem('profile_avatar', 'avatar-current');

    const { result } = renderHook(() => useProfileSettings());

    expect(result.current.profileName).toBe('Ada');
    expect(result.current.profileAvatar).toBe('avatar-current');
  });

  it('uses the selected language for the default profile name', () => {
    localStorage.setItem(languageStorageKey, 'en');

    const { result } = renderHook(() => useProfileSettings(), {
      wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>,
    });

    expect(result.current.profileName).toBe('Aegis User');
  });

  it('opens and closes the profile modal', () => {
    const { result } = renderHook(() => useProfileSettings());

    act(() => result.current.openProfile());
    expect(result.current.isProfileModalOpen).toBe(true);

    act(() => result.current.closeProfile());
    expect(result.current.isProfileModalOpen).toBe(false);
  });

  it('saves profile settings and calls the saved callback', () => {
    const onSaved = vi.fn();
    const { result } = renderHook(() => useProfileSettings({ onSaved }));

    act(() => result.current.saveProfile('Hafiz', 'avatar-next'));

    expect(result.current.profileName).toBe('Hafiz');
    expect(result.current.profileAvatar).toBe('avatar-next');
    expect(localStorage.getItem('profile_name')).toBe('Hafiz');
    expect(localStorage.getItem('profile_avatar')).toBe('avatar-next');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
