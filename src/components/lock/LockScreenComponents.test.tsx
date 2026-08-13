/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LockScreenHeader } from './LockScreenHeader';
import { LockScreenSecretKeySection } from './LockScreenSecretKeySection';
import { LockScreenBiometricSection } from './LockScreenBiometricSection';
import { LockScreenResetModal } from './LockScreenResetModal';
import { LockScreenRecoveryModal } from './LockScreenRecoveryModal';

const setLanguageMock = vi.fn();

vi.mock('../../i18n/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
    language: 'en',
    setLanguage: setLanguageMock,
  }),
  LanguageProvider: ({ children }: any) => children,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LockScreen Modular Subcomponents', () => {
  it('renders LockScreenHeader and triggers language selection', () => {
    render(<LockScreenHeader />);

    const langSelect = screen.getByTestId('lock-language-select');
    expect(langSelect).toBeDefined();
    fireEvent.change(langSelect, { target: { value: 'tr' } });
    expect(setLanguageMock).toHaveBeenCalledWith('tr');
  });

  it('renders LockScreenSecretKeySection and handles input / checkbox / download', () => {
    const setSecretKey = vi.fn();
    const setRememberSecretKey = vi.fn();
    const onDownloadKit = vi.fn();

    render(
      <LockScreenSecretKeySection
        secretKey="ABCD-1234-EFGH-5678"
        setSecretKey={setSecretKey}
        isSetup={false}
        requiresSecretKey={true}
        rememberSecretKey={false}
        setRememberSecretKey={setRememberSecretKey}
        onDownloadEmergencyKit={onDownloadKit}
      />
    );

    const input = screen.getByTestId('lock-secret-key-input');
    expect(input).toBeDefined();

    const downloadBtn = screen.getByTestId('lock-emergency-kit-button');
    fireEvent.click(downloadBtn);
    expect(onDownloadKit).toHaveBeenCalled();

    const checkbox = screen.getByTestId('lock-remember-secret-key-checkbox');
    fireEvent.click(checkbox);
    expect(setRememberSecretKey).toHaveBeenCalledWith(true);
  });

  it('renders LockScreenBiometricSection and triggers biometric unlock', () => {
    const onBiometricUnlock = vi.fn();
    render(
      <LockScreenBiometricSection
        isSetup={true}
        isBioEnabled={true}
        biometricLoading={false}
        biometricType="platform"
        onBiometricUnlock={onBiometricUnlock}
      />
    );

    const bioBtn = screen.getByRole('button');
    fireEvent.click(bioBtn);
    expect(onBiometricUnlock).toHaveBeenCalled();
  });

  it('renders LockScreenResetModal and confirms reset', () => {
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();

    render(
      <LockScreenResetModal
        isOpen={true}
        onClose={onClose}
        onConfirmReset={onConfirm}
        resetLoading={false}
      />
    );

    const confirmBtn = screen.getByTestId('lock-reset-confirm-button');
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalled();

    const cancelBtn = screen.getByTestId('lock-reset-cancel-button');
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('renders LockScreenRecoveryModal with tabs and close action', () => {
    const onClose = vi.fn();
    const onUnlockedAfterRecovery = vi.fn();
    const onClearLockoutState = vi.fn();

    render(
      <LockScreenRecoveryModal
        isOpen={true}
        onClose={onClose}
        onUnlockedAfterRecovery={onUnlockedAfterRecovery}
        onClearLockoutState={onClearLockoutState}
      />
    );

    expect(screen.getByTestId('lock-recovery-modal')).toBeDefined();
    const closeBtn = screen.getByTestId('lock-recovery-modal-close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
