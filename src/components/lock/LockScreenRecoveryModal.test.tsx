/**
 * @vitest-environment jsdom
 */

import React from 'react';
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
});
