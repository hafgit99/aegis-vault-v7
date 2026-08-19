/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsBiometric } from './useSettingsBiometric';
import * as biometricModule from '../lib/biometric';
import * as storageModule from '../lib/storage';
import * as vaultSessionModule from '../lib/vaultSession';
import * as androidAutofillModule from '../lib/androidAutofill';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';

vi.mock('../lib/biometric', () => ({
  isBiometricEnabled: vi.fn(() => false),
  isBiometricSupported: vi.fn(() => true),
  disableBiometric: vi.fn(),
  registerBiometric: vi.fn(),
}));

vi.mock('../lib/storage', () => ({
  getRememberedAccountSecretKey: vi.fn(() => 'SECRET-123'),
  verifyMasterPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/vaultSession', () => ({
  withActiveBackupPassword: vi.fn((cb) => cb('master-pass-123')),
  withActiveAccountSecretKey: vi.fn((cb) => cb('SECRET-123')),
}));

vi.mock('../lib/androidAutofill', () => ({
  isAndroidAutofillEnabled: vi.fn(() => false),
  isAndroidAutofillSupported: vi.fn(() => true),
  openAndroidAutofillSettings: vi.fn(() => true),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useSettingsBiometric', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enables biometric authentication directly when active session password is available', async () => {
    vi.mocked(biometricModule.isBiometricEnabled).mockReturnValue(false);
    vi.mocked(biometricModule.registerBiometric).mockResolvedValueOnce(undefined as any);

    const { result } = renderHook(() => useSettingsBiometric(), { wrapper });

    await act(async () => {
      await result.current.handleToggleBiometric('platform');
    });

    expect(biometricModule.registerBiometric).toHaveBeenCalledWith(
      { masterPassword: 'master-pass-123', secretKey: 'SECRET-123' },
      'platform',
    );
    expect(result.current.biometricEnabled).toBe(true);
    expect(result.current.biometricSuccess).toBeTruthy();
  });

  it('disables biometric when currently enabled', async () => {
    vi.mocked(biometricModule.isBiometricEnabled).mockReturnValue(true);

    const { result } = renderHook(() => useSettingsBiometric(), { wrapper });

    await act(async () => {
      await result.current.handleToggleBiometric('platform');
    });

    expect(biometricModule.disableBiometric).toHaveBeenCalled();
    expect(result.current.biometricEnabled).toBe(false);
  });

  it('opens password confirmation prompt when auto password is not in session', async () => {
    vi.mocked(biometricModule.isBiometricEnabled).mockReturnValue(false);
    vi.mocked(vaultSessionModule.withActiveBackupPassword).mockImplementationOnce((cb) => Promise.resolve(cb(null as any)));

    const { result } = renderHook(() => useSettingsBiometric(), { wrapper });

    await act(async () => {
      await result.current.handleToggleBiometric('cross-platform');
    });

    expect(result.current.isPasswordPromptOpen).toBe(true);

    // Confirm password manually
    await act(async () => {
      await result.current.handleConfirmBiometricPassword('entered-pass');
    });

    expect(biometricModule.registerBiometric).toHaveBeenCalledWith(
      { masterPassword: 'entered-pass', secretKey: 'SECRET-123' },
      'cross-platform',
    );
    expect(result.current.isPasswordPromptOpen).toBe(false);
    expect(result.current.biometricEnabled).toBe(true);
  });

  it('rejects incorrect master password on confirmation', async () => {
    vi.mocked(storageModule.verifyMasterPassword).mockResolvedValueOnce(false);

    const { result } = renderHook(() => useSettingsBiometric(), { wrapper });

    await act(async () => {
      await result.current.handleConfirmBiometricPassword('wrong-pass');
    });

    expect(result.current.passwordPromptError).toBeTruthy();
    expect(biometricModule.registerBiometric).not.toHaveBeenCalled();
  });

  it('handles Android Autofill settings opening', () => {
    const { result } = renderHook(() => useSettingsBiometric(), { wrapper });

    act(() => {
      result.current.handleOpenAndroidAutofillSettings();
    });

    expect(androidAutofillModule.openAndroidAutofillSettings).toHaveBeenCalled();
    expect(result.current.autofillMessage).toBeTruthy();
  });

  it('reports error when Android Autofill is unsupported', () => {
    vi.mocked(androidAutofillModule.isAndroidAutofillSupported).mockReturnValueOnce(false);

    const { result } = renderHook(() => useSettingsBiometric(), { wrapper });

    act(() => {
      result.current.handleOpenAndroidAutofillSettings();
    });

    expect(result.current.autofillError).toBeTruthy();
  });
});
