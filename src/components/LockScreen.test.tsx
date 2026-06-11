/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '../lib/branding';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import {
  authenticateBiometric,
  isBiometricEnabled,
  isBiometricSupported,
} from '../lib/biometric';
import {
  getRememberedAccountSecretKey,
  isAccountSecretKeyRequired,
  isMasterPasswordSet,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
} from '../lib/storage';
import LockScreen from './LockScreen';

vi.mock('../lib/storage', () => ({
  getRememberedAccountSecretKey: vi.fn(() => null),
  isAccountSecretKeyRequired: vi.fn(() => false),
  isMasterPasswordSet: vi.fn(),
  setupMasterPasswordWithSecretKey: vi.fn(async () => undefined),
  verifyMasterPassword: vi.fn(),
}));

vi.mock('../lib/biometric', () => ({
  authenticateBiometric: vi.fn(),
  isBiometricEnabled: vi.fn(() => false),
  isBiometricSupported: vi.fn(() => false),
}));

function passwordInput(): HTMLInputElement {
  return screen.getByTestId('lock-password-input') as HTMLInputElement;
}

function confirmationInput(): HTMLInputElement {
  return screen.getByTestId('lock-confirm-password-input') as HTMLInputElement;
}

function secretKeyInput(): HTMLInputElement {
  return screen.getByTestId('lock-secret-key-input') as HTMLInputElement;
}

beforeEach(() => {
  vi.mocked(isMasterPasswordSet).mockReturnValue(false);
  vi.mocked(isAccountSecretKeyRequired).mockReturnValue(false);
  vi.mocked(getRememberedAccountSecretKey).mockReturnValue(null);
  vi.mocked(verifyMasterPassword).mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe('LockScreen', () => {
  it('validates minimum master password length during setup', () => {
    render(<LockScreen onUnlock={vi.fn()} />);

    const password = passwordInput();
    const confirmation = confirmationInput();
    fireEvent.change(password, { target: { value: '12345' } });
    fireEvent.change(confirmation, { target: { value: '12345' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText(/en az 12/)).toBeTruthy();
    expect(setupMasterPasswordWithSecretKey).not.toHaveBeenCalled();
  });

  it('renders setup copy and validation feedback in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByText('SMART CYBER SECURITY VAULT')).toBeTruthy();
    expect(screen.getByText('Set Up Your Secure Vault')).toBeTruthy();
    expect(screen.getByText('Start Secure Vault')).toBeTruthy();

    const password = passwordInput();
    const confirmation = confirmationInput();
    fireEvent.change(password, { target: { value: '12345' } });
    fireEvent.change(confirmation, { target: { value: '12345' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText('The master password must be at least 12 characters.')).toBeTruthy();
    expect(setupMasterPasswordWithSecretKey).not.toHaveBeenCalled();
  });

  it('sets up the master password and unlocks when confirmation matches', async () => {
    const onUnlock = vi.fn();
    render(<LockScreen onUnlock={onUnlock} />);

    const password = passwordInput();
    const confirmation = confirmationInput();
    fireEvent.change(password, { target: { value: 'strong-pass-12' } });
    fireEvent.change(confirmation, { target: { value: 'strong-pass-12' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(setupMasterPasswordWithSecretKey).toHaveBeenCalledWith(
        'strong-pass-12',
        expect.stringMatching(/^A3-/),
        false,
      );
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });
  });

  it('can remember the generated secret key during setup', async () => {
    const onUnlock = vi.fn();
    render(<LockScreen onUnlock={onUnlock} />);

    fireEvent.change(passwordInput(), { target: { value: 'strong-pass-12' } });
    fireEvent.change(confirmationInput(), { target: { value: 'strong-pass-12' } });
    fireEvent.click(screen.getByTestId('lock-remember-secret-key-checkbox'));
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(setupMasterPasswordWithSecretKey).toHaveBeenCalledWith(
        'strong-pass-12',
        expect.stringMatching(/^A3-/),
        true,
      );
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects setup when confirmation does not match', () => {
    render(<LockScreen onUnlock={vi.fn()} />);

    const password = passwordInput();
    const confirmation = confirmationInput();
    fireEvent.change(password, { target: { value: 'strong-pass-12' } });
    fireEvent.change(confirmation, { target: { value: 'different-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText(/birbiriyle/)).toBeTruthy();
    expect(setupMasterPasswordWithSecretKey).not.toHaveBeenCalled();
  });

  it('toggles password visibility in setup mode', () => {
    render(<LockScreen onUnlock={vi.fn()} />);

    const password = passwordInput();
    const confirmation = confirmationInput();
    const toggleButtons = Array.from(document.querySelectorAll('form button[title]')) as HTMLButtonElement[];

    expect(password.type).toBe('password');
    expect(confirmation.type).toBe('password');

    fireEvent.click(toggleButtons[0]);
    fireEvent.click(toggleButtons[1]);

    expect(password.type).toBe('text');
    expect(confirmation.type).toBe('text');

    fireEvent.click(toggleButtons[0]);
    fireEvent.click(toggleButtons[1]);

    expect(password.type).toBe('password');
    expect(confirmation.type).toBe('password');
  });

  it('unlocks an existing vault only when the password verifies', async () => {
    const onUnlock = vi.fn();
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    render(<LockScreen onUnlock={onUnlock} />);

    expect(screen.getByText('Kasa Kilitleri Aktif')).toBeTruthy();
    expect(screen.getAllByText(new RegExp(APP_NAME)).length).toBeGreaterThan(0);

    const password = passwordInput();
    fireEvent.change(password, { target: { value: 'wrong-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText(/Güvenlik gecikmesi/i)).toBeTruthy();
      expect(onUnlock).not.toHaveBeenCalled();
    });

    window.localStorage.removeItem('aegis_lockout_state');

    fireEvent.change(password, { target: { value: 'correct-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(verifyMasterPassword).toHaveBeenCalledWith('wrong-pass', null);
      expect(verifyMasterPassword).toHaveBeenCalledWith('correct-pass', null);
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });
  });

  it('applies progressive lockout after a failed unlock attempt', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(verifyMasterPassword).mockResolvedValue(false);

    render(<LockScreen onUnlock={vi.fn()} />);

    fireEvent.change(passwordInput(), { target: { value: 'wrong-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText(/Güvenlik gecikmesi/i)).toBeTruthy();
    });

    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(verifyMasterPassword).toHaveBeenCalledTimes(1);
  });

  it('requires the account secret key when the vault profile uses one', async () => {
    const onUnlock = vi.fn();
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isAccountSecretKeyRequired).mockReturnValue(true);
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(true);

    render(<LockScreen onUnlock={onUnlock} />);

    fireEvent.change(passwordInput(), { target: { value: 'correct-pass' } });
    fireEvent.change(secretKeyInput(), { target: { value: 'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(verifyMasterPassword).toHaveBeenCalledWith(
        'correct-pass',
        'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      );
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a biometric unsupported error without calling authentication', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(false);
    const onUnlock = vi.fn();

    render(<LockScreen onUnlock={onUnlock} />);

    fireEvent.click(screen.getByText(/Biyometrik/));

    await waitFor(() => {
      expect(screen.getByText(/desteklenmiyor/)).toBeTruthy();
    });
    expect(authenticateBiometric).not.toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it('unlocks with a verified biometric master password', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(authenticateBiometric).mockResolvedValueOnce('bio-master');
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(true);
    const onUnlock = vi.fn();

    render(<LockScreen onUnlock={onUnlock} />);

    fireEvent.click(screen.getByText(/Biyometrik/));

    await waitFor(() => {
      expect(authenticateBiometric).toHaveBeenCalled();
      expect(verifyMasterPassword).toHaveBeenCalledWith('bio-master', null);
      expect(onUnlock).toHaveBeenCalled();
    });
  });

  it('shows biometric integrity failure when the decrypted master password is rejected', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(authenticateBiometric).mockResolvedValueOnce('stale-master');
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(false);

    render(<LockScreen onUnlock={vi.fn()} />);

    fireEvent.click(screen.getByText(/Biyometrik/));

    await waitFor(() => {
      expect(screen.getByText(/manuel olarak/)).toBeTruthy();
    });
  });

  it('maps biometric permission errors to a user-facing message', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    const permissionError = new Error('cancelled');
    permissionError.name = 'NotAllowedError';
    vi.mocked(authenticateBiometric).mockRejectedValueOnce(permissionError);

    render(<LockScreen onUnlock={vi.fn()} />);

    fireEvent.click(screen.getByText(/Biyometrik/));

    await waitFor(() => {
      expect(screen.getByText(/iptal edildi/)).toBeTruthy();
    });
  });

  it('auto-triggers biometric unlock when an existing vault has biometrics enabled', async () => {
    vi.useFakeTimers();
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(authenticateBiometric).mockResolvedValueOnce('auto-master');
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(true);
    const onUnlock = vi.fn();

    render(<LockScreen onUnlock={onUnlock} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(authenticateBiometric).toHaveBeenCalledTimes(1);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });
});
