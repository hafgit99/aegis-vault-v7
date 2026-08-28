/**
 * @vitest-environment jsdom
 */

import React from 'react';
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LockScreenRecoveryModal } from './LockScreenRecoveryModal';
import { LanguageProvider } from '../../i18n/LanguageContext';
import * as recoveryKeyModule from '../../lib/recoveryKey';
import * as biometricModule from '../../lib/biometric';
import * as passwordHintModule from '../../lib/passwordHint';
import * as storageModule from '../../lib/storage';

vi.mock('../../lib/recoveryKey');
vi.mock('../../lib/biometric');
vi.mock('../../lib/passwordHint');
vi.mock('../../lib/storage');

describe('LockScreenRecoveryModal', () => {
  beforeEach(() => {
    // getPasswordHint is async (M1 encrypted envelope) — provide a safe
    // default so the modal's load effect always gets a promise.
    vi.mocked(passwordHintModule.getPasswordHint).mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderModal(props: Partial<ComponentProps<typeof LockScreenRecoveryModal>> = {}) {
    return render(
      <LanguageProvider>
        <LockScreenRecoveryModal
          isOpen
          onClose={vi.fn()}
          onUnlockedAfterRecovery={vi.fn()}
          onClearLockoutState={vi.fn()}
          {...props}
        />
      </LanguageProvider>,
    );
  }

  /** Drives the key-recovery flow until the "set new password" step is visible. */
  async function openPasswordResetStep(props: Partial<ComponentProps<typeof LockScreenRecoveryModal>> = {}) {
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(true);
    vi.mocked(recoveryKeyModule.recoverWithRecoveryKey).mockResolvedValue('OldPass123!');

    renderModal(props);

    fireEvent.change(
      screen.getByTestId('lock-recovery-words-input'),
      { target: { value: 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12' } },
    );
    fireEvent.click(screen.getByTestId('lock-recovery-submit-button'));

    await screen.findByTestId('lock-recovery-new-password');
  }

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <LanguageProvider>
        <LockScreenRecoveryModal
          isOpen={false}
          onClose={vi.fn()}
          onUnlockedAfterRecovery={vi.fn()}
          onClearLockoutState={vi.fn()}
        />
      </LanguageProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal tabs and handles tab switching', async () => {
    vi.mocked(passwordHintModule.getPasswordHint).mockResolvedValue('My pet name');

    render(
      <LanguageProvider>
        <LockScreenRecoveryModal
          isOpen={true}
          onClose={vi.fn()}
          onUnlockedAfterRecovery={vi.fn()}
          onClearLockoutState={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('lock-recovery-tab-key')).toBeDefined();
    expect(screen.getByTestId('lock-recovery-tab-hint')).toBeDefined();

    // Switch to hint tab
    fireEvent.click(screen.getByTestId('lock-recovery-tab-hint'));
    expect(await screen.findByTestId('lock-recovery-hint-content')).toBeDefined();
  });

  it('handles recovery key submission and password reset flow', async () => {
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(true);
    vi.mocked(recoveryKeyModule.recoverWithRecoveryKey).mockResolvedValueOnce('OldPass123!');
    vi.mocked(storageModule.changeMasterPassword).mockResolvedValueOnce();

    const onUnlockedAfterRecovery = vi.fn();
    const onClearLockoutState = vi.fn();

    render(
      <LanguageProvider>
        <LockScreenRecoveryModal
          isOpen={true}
          onClose={vi.fn()}
          onUnlockedAfterRecovery={onUnlockedAfterRecovery}
          onClearLockoutState={onClearLockoutState}
        />
      </LanguageProvider>,
    );

    const input = screen.getByTestId('lock-recovery-words-input');
    fireEvent.change(input, { target: { value: 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12' } });

    const submitBtn = screen.getByTestId('lock-recovery-submit-button');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(recoveryKeyModule.recoverWithRecoveryKey).toHaveBeenCalled();
    });
  });

  it('handles biometric recovery click', async () => {
    vi.mocked(biometricModule.isBiometricEnabled).mockReturnValue(true);
    vi.mocked(biometricModule.authenticateBiometric).mockResolvedValueOnce('BioPass123!');

    render(
      <LanguageProvider>
        <LockScreenRecoveryModal
          isOpen={true}
          onClose={vi.fn()}
          onUnlockedAfterRecovery={vi.fn()}
          onClearLockoutState={vi.fn()}
        />
      </LanguageProvider>,
    );

    const bioTab = screen.getByTestId('lock-recovery-tab-biometric');
    fireEvent.click(bioTab);

    const bioBtn = screen.getByTestId('lock-recovery-biometric-button');
    fireEvent.click(bioBtn);

    await waitFor(() => {
      expect(biometricModule.authenticateBiometric).toHaveBeenCalled();
    });
  });

  it('shows the no-key fallback when the recovery key is not set up', () => {
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(false);

    renderModal();

    expect(screen.getByText('Kayıtlı bir Recovery Key bulunamadı.')).toBeTruthy();
    expect(screen.queryByTestId('lock-recovery-words-input')).toBeNull();
  });

  it('shows the empty-hint fallback when no hint is stored', async () => {
    vi.mocked(passwordHintModule.getPasswordHint).mockResolvedValue(null);

    renderModal();

    fireEvent.click(screen.getByTestId('lock-recovery-tab-hint'));

    await waitFor(() => {
      expect(screen.getByText('Kayıtlı bir şifre ipucu bulunamadı.')).toBeTruthy();
    });
    expect(screen.queryByTestId('lock-recovery-hint-content')).toBeNull();
  });

  it('shows the biometric-disabled fallback on the biometric tab', () => {
    vi.mocked(biometricModule.isBiometricEnabled).mockReturnValue(false);

    renderModal();

    fireEvent.click(screen.getByTestId('lock-recovery-tab-biometric'));

    expect(screen.getByText('Biyometrik kilit açma etkin değil veya bu cihazda desteklenmiyor.')).toBeTruthy();
    expect(screen.queryByTestId('lock-recovery-biometric-button')).toBeNull();
  });

  it('closes via the modal close button', () => {
    const onClose = vi.fn();

    renderModal({ onClose });

    fireEvent.click(screen.getByTestId('lock-recovery-modal-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('surfaces recovery key decryption failures', async () => {
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(true);
    vi.mocked(recoveryKeyModule.recoverWithRecoveryKey).mockRejectedValueOnce(new Error('Invalid recovery phrase'));

    renderModal();

    fireEvent.change(
      screen.getByTestId('lock-recovery-words-input'),
      { target: { value: 'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12' } },
    );
    fireEvent.click(screen.getByTestId('lock-recovery-submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-recovery-error').textContent).toContain('Invalid recovery phrase');
    });
    expect(screen.queryByTestId('lock-recovery-new-password')).toBeNull();
  });

  it('maps biometric permission errors to the permission message', async () => {
    vi.mocked(biometricModule.isBiometricEnabled).mockReturnValue(true);
    vi.mocked(biometricModule.authenticateBiometric).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );

    renderModal();

    fireEvent.click(screen.getByTestId('lock-recovery-tab-biometric'));
    fireEvent.click(screen.getByTestId('lock-recovery-biometric-button'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-recovery-error').textContent).toContain('Biyometrik doğrulama izni kısıtlandı');
    });
  });

  it('maps biometric error codes to the failure banner', async () => {
    vi.mocked(biometricModule.isBiometricEnabled).mockReturnValue(true);
    const errorCodes = [
      'biometric.unsupported',
      'biometric.integrityMismatch',
      'biometric.missingBundle',
      'biometric.authenticationCancelled',
      'biometric.unknownCode',
    ];

    for (const code of errorCodes) {
      vi.mocked(biometricModule.authenticateBiometric).mockRejectedValueOnce(
        Object.assign(new Error('bio failed'), { code }),
      );

      renderModal();

      fireEvent.click(screen.getByTestId('lock-recovery-tab-biometric'));
      fireEvent.click(screen.getByTestId('lock-recovery-biometric-button'));

      await waitFor(() => {
        expect(screen.getByTestId('lock-recovery-error')).toBeTruthy();
      });

      cleanup();
    }
  });

  it('rejects weak replacement passwords with the complexity error', async () => {
    await openPasswordResetStep();

    fireEvent.change(screen.getByTestId('lock-recovery-new-password'), { target: { value: 'weakpass' } });
    fireEvent.change(screen.getByTestId('lock-recovery-confirm-password'), { target: { value: 'weakpass' } });
    fireEvent.click(screen.getByTestId('lock-recovery-apply-button'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-recovery-error').textContent).toContain('karmaşık');
    });
    expect(storageModule.changeMasterPassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched replacement passwords', async () => {
    await openPasswordResetStep();

    fireEvent.change(screen.getByTestId('lock-recovery-new-password'), { target: { value: 'NewSecure1!x' } });
    fireEvent.change(screen.getByTestId('lock-recovery-confirm-password'), { target: { value: 'Different1!x' } });
    fireEvent.click(screen.getByTestId('lock-recovery-apply-button'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-recovery-error').textContent).toContain('eşleşmiyor');
    });
    expect(storageModule.changeMasterPassword).not.toHaveBeenCalled();
  });

  it('surfaces changeMasterPassword failures', async () => {
    await openPasswordResetStep();

    vi.mocked(storageModule.changeMasterPassword).mockReset();
    vi.mocked(storageModule.changeMasterPassword).mockRejectedValueOnce(new Error('Vault update failed'));

    fireEvent.change(screen.getByTestId('lock-recovery-new-password'), { target: { value: 'NewSecure1!x' } });
    fireEvent.change(screen.getByTestId('lock-recovery-confirm-password'), { target: { value: 'NewSecure1!x' } });
    fireEvent.click(screen.getByTestId('lock-recovery-apply-button'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-recovery-error').textContent).toContain('Vault update failed');
    });
  });

  it('applies the new master password and unlocks after recovery', async () => {
    const onUnlockedAfterRecovery = vi.fn();
    const onClearLockoutState = vi.fn();

    await openPasswordResetStep({ onUnlockedAfterRecovery, onClearLockoutState });

    vi.mocked(storageModule.changeMasterPassword).mockReset();
    vi.mocked(storageModule.changeMasterPassword).mockResolvedValue(undefined);

    fireEvent.change(screen.getByTestId('lock-recovery-new-password'), { target: { value: 'NewSecure1!x' } });
    fireEvent.change(screen.getByTestId('lock-recovery-confirm-password'), { target: { value: 'NewSecure1!x' } });
    fireEvent.click(screen.getByTestId('lock-recovery-apply-button'));

    await waitFor(() => {
      expect(screen.getByTestId('lock-recovery-success').textContent).toContain('Şifreniz başarıyla değiştirildi');
    });
    expect(storageModule.changeMasterPassword).toHaveBeenCalledWith('OldPass123!', 'NewSecure1!x');
    expect(onClearLockoutState).toHaveBeenCalledTimes(1);

    // The unlock callback is intentionally deferred by 800ms.
    await waitFor(
      () => {
        expect(onUnlockedAfterRecovery).toHaveBeenCalledTimes(1);
      },
      { timeout: 2000 },
    );
  });
});
