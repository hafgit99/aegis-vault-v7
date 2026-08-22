/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import {
  authenticateBiometric,
  authenticateBiometricCredentials,
  isBiometricEnabled,
  isBiometricSupported,
  getBiometricType,
} from '../lib/biometric';
import {
  getRememberedAccountSecretKey,
  isAccountSecretKeyRequired,
  isMasterPasswordSet,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
} from '../lib/storage';
import { clearAllSetupFlagsSync, removeIndexedDbItemSync } from '../lib/indexedDbStorage';
import LockScreen from './LockScreen';

vi.mock('../lib/storage', () => ({
  getRememberedAccountSecretKey: vi.fn(() => null),
  isAccountSecretKeyRequired: vi.fn(() => false),
  isRememberSecretKeySupported: vi.fn(() => true),
  isMasterPasswordSet: vi.fn(),
  setupMasterPasswordWithSecretKey: vi.fn(async () => undefined),
  verifyMasterPassword: vi.fn(),
  resetSystem: vi.fn(async () => undefined),
}));

vi.mock('../lib/biometric', () => ({
  authenticateBiometric: vi.fn(),
  authenticateBiometricCredentials: vi.fn(async () => ({ masterPassword: 'bio-master', secretKey: null })),
  isBiometricEnabled: vi.fn(() => false),
  isBiometricSupported: vi.fn(() => false),
  getBiometricType: vi.fn(() => 'platform'),
  isBiometricV2UpgradeRequired: vi.fn(() => false),
  dismissBiometricV2UpgradeNotification: vi.fn(),
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
  vi.mocked(isBiometricEnabled).mockReturnValue(false);
  vi.mocked(isBiometricSupported).mockReturnValue(false);
  vi.mocked(getBiometricType).mockReturnValue('platform');
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.localStorage.clear();
  clearAllSetupFlagsSync();
  vi.clearAllMocks();
});

describe('LockScreen', () => {
  it('shows the asset integrity warning before credentials are submitted', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} integrityWarning />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('asset-integrity-warning')).toBeTruthy();
    expect(screen.getByText('Application Integrity Warning')).toBeTruthy();
  });

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

    expect(screen.getAllByText('Set Up Your Secure Vault').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Start Secure Vault').length).toBeGreaterThanOrEqual(1);

    const password = passwordInput();
    const confirmation = confirmationInput();
    fireEvent.change(password, { target: { value: '12345' } });
    fireEvent.change(confirmation, { target: { value: '12345' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText(/must be at least 12 characters/i)).toBeTruthy();
    expect(setupMasterPasswordWithSecretKey).not.toHaveBeenCalled();
  });

  it('shows a pending Android Autofill banner on the unlock screen', () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);

    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} isAutofillPending />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('lock-autofill-pending-banner')).toBeTruthy();
    expect(screen.getByText('Android Autofill isteği bekliyor')).toBeTruthy();
  });

  it('requires accepting terms of service and privacy policy during setup', async () => {
    const onUnlock = vi.fn();
    render(<LockScreen onUnlock={onUnlock} />);

    const password = passwordInput();
    const confirmation = confirmationInput();
    fireEvent.change(password, { target: { value: 'strong-pass-12' } });
    fireEvent.change(confirmation, { target: { value: 'strong-pass-12' } });
    
    // Submit without checking the terms checkbox
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText(/Kullanım Koşulları ve Gizlilik Politikası/i)).toBeTruthy();
    expect(setupMasterPasswordWithSecretKey).not.toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();

    // Open terms modal by clicking the terms link
    fireEvent.click(screen.getByTestId('lock-terms-link'));
    expect(screen.getByTestId('legal-terms-modal')).toBeTruthy();
    expect(screen.getByText(/Zero-Knowledge Security/i)).toBeTruthy();

    // Switch to privacy tab in modal
    fireEvent.click(screen.getByTestId('legal-terms-tab-privacy'));
    expect(screen.getByTestId('legal-terms-tab-privacy')).toBeTruthy();

    // Close the modal
    fireEvent.click(screen.getByTestId('legal-terms-modal-confirm-btn'));
    expect(screen.queryByTestId('legal-terms-modal')).toBeNull();

    // Check the terms checkbox and submit
    fireEvent.click(screen.getByTestId('lock-terms-checkbox'));
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

  it('sets up the master password and unlocks when confirmation matches and terms accepted', async () => {
    const onUnlock = vi.fn();
    render(<LockScreen onUnlock={onUnlock} />);

    const password = passwordInput();
    const confirmation = confirmationInput();
    fireEvent.change(password, { target: { value: 'strong-pass-12' } });
    fireEvent.change(confirmation, { target: { value: 'strong-pass-12' } });
    fireEvent.click(screen.getByTestId('lock-terms-checkbox'));
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
    fireEvent.click(screen.getByTestId('lock-terms-checkbox'));
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

    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);

    expect(password.type).toBe('text');
    expect(confirmation.type).toBe('text');

    fireEvent.click(toggleButtons[0]!);
    fireEvent.click(toggleButtons[1]!);

    expect(password.type).toBe('password');
    expect(confirmation.type).toBe('password');
  });

  it('unlocks an existing vault only when the password verifies', async () => {
    const onUnlock = vi.fn();
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    render(<LockScreen onUnlock={onUnlock} />);

    expect(screen.getAllByText('Kasa Kilitleri Aktif').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Sistem Kilidini Aç').length).toBeGreaterThanOrEqual(1);

    const password = passwordInput();
    fireEvent.change(password, { target: { value: 'wrong-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText(/Güvenlik gecikmesi/i)).toBeTruthy();
      expect(onUnlock).not.toHaveBeenCalled();
    });

    window.localStorage.removeItem('aegis_lockout_state');
    removeIndexedDbItemSync('aegis_lockout_state');

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

    fireEvent.click(screen.getByText(/OS/));

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
    vi.mocked(authenticateBiometricCredentials).mockResolvedValueOnce({ masterPassword: 'bio-master', secretKey: null });
    vi.mocked(verifyMasterPassword).mockResolvedValue(true);
    const onUnlock = vi.fn();

    render(<LockScreen onUnlock={onUnlock} />);

    fireEvent.click(screen.getByText(/OS/));

    await waitFor(() => {
      expect(authenticateBiometricCredentials).toHaveBeenCalled();
      expect(verifyMasterPassword).toHaveBeenCalledWith('bio-master', null);
      expect(onUnlock).toHaveBeenCalled();
    });
  });

  it('unlocks with a verified FIDO2 security key', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(getBiometricType).mockReturnValue('cross-platform');
    vi.mocked(authenticateBiometricCredentials).mockResolvedValueOnce({ masterPassword: 'bio-master', secretKey: null });
    vi.mocked(verifyMasterPassword).mockResolvedValue(true);
    const onUnlock = vi.fn();

    render(<LockScreen onUnlock={onUnlock} />);

    fireEvent.click(screen.getByText(/FIDO2/));

    await waitFor(() => {
      expect(authenticateBiometricCredentials).toHaveBeenCalled();
      expect(verifyMasterPassword).toHaveBeenCalledWith('bio-master', null);
      expect(onUnlock).toHaveBeenCalled();
    });
  });

  it('shows biometric integrity failure when the decrypted master password is rejected', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(authenticateBiometricCredentials).mockResolvedValueOnce({ masterPassword: 'stale-master', secretKey: null });
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(false);

    render(<LockScreen onUnlock={vi.fn()} />);

    fireEvent.click(screen.getByText(/OS/));

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
    vi.mocked(authenticateBiometricCredentials).mockRejectedValueOnce(permissionError);

    render(<LockScreen onUnlock={vi.fn()} />);

    fireEvent.click(screen.getByText(/OS/));

    await waitFor(() => {
      expect(screen.getByText(/iptal edildi/)).toBeTruthy();
    });
  });

  it('auto-triggers biometric unlock when an existing vault has biometrics enabled', async () => {
    vi.useFakeTimers();
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    vi.mocked(isBiometricEnabled).mockReturnValue(true);
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(authenticateBiometricCredentials).mockResolvedValueOnce({ masterPassword: 'auto-master', secretKey: null });
    vi.mocked(verifyMasterPassword).mockResolvedValue(true);
    const onUnlock = vi.fn();

    render(<LockScreen onUnlock={onUnlock} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(authenticateBiometricCredentials).toHaveBeenCalledTimes(1);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it('renders a language selector and updates the UI language', () => {
    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} />
      </LanguageProvider>,
    );

    const select = screen.getByTestId('lock-language-select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe('tr'); // Default language is Turkish

    // Switch to English
    fireEvent.change(select, { target: { value: 'en' } });
    expect(select.value).toBe('en');
    expect(screen.getAllByText('Set Up Your Secure Vault').length).toBeGreaterThanOrEqual(1);
  });

  it('detects Caps Lock activation and displays warning badge', () => {
    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} />
      </LanguageProvider>,
    );

    const input = passwordInput();
    expect(screen.queryByTestId('caps-lock-warning')).toBeNull();

    // Trigger keydown with CapsLock modifier active
    fireEvent.keyDown(input, {
      key: 'A',
      modifierCapsLock: true,
    });

    expect(screen.getByTestId('caps-lock-warning')).toBeTruthy();

    // Blur clears the warning
    fireEvent.blur(input);
    expect(screen.queryByTestId('caps-lock-warning')).toBeNull();
  });

  it('renders real-time PasswordStrengthMeter during first-time master password setup', () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(false);

    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} />
      </LanguageProvider>,
    );

    const input = passwordInput();
    expect(screen.queryByTestId('password-strength-meter')).toBeNull();

    // Enter a password to trigger strength evaluation
    fireEvent.change(input, { target: { value: 'MasterPass123!@#' } });
    expect(screen.getByTestId('password-strength-meter')).toBeTruthy();
  });

  it('opens recovery modal, reset modal and legal modal', async () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(true);
    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      writable: true,
      configurable: true,
    });

    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} />
      </LanguageProvider>,
    );

    // Open Forgot Password modal
    const forgotBtn = screen.getByTestId('lock-forgot-password-button');
    fireEvent.click(forgotBtn);
    expect(screen.getByTestId('lock-recovery-modal')).toBeTruthy();

    // Open Reset modal
    const resetBtn = screen.getByTestId('lock-reset-vault-button');
    fireEvent.click(resetBtn);
    expect(screen.getByTestId('lock-reset-cancel-button')).toBeTruthy();

    const resetConfirmBtn = screen.getByTestId('lock-reset-confirm-button');
    fireEvent.click(resetConfirmBtn);
  });

  it('verifies hardened security attributes on password and secret key inputs', () => {
    vi.mocked(isMasterPasswordSet).mockReturnValue(false);
    vi.mocked(isAccountSecretKeyRequired).mockReturnValue(true);

    render(
      <LanguageProvider>
        <LockScreen onUnlock={vi.fn()} />
      </LanguageProvider>,
    );

    const passInput = screen.getByTestId('lock-password-input');
    expect(passInput.getAttribute('autocomplete')).toBe('off');
    expect(passInput.getAttribute('autocorrect')).toBe('off');
    expect(passInput.getAttribute('autocapitalize')).toBe('off');
    expect(passInput.getAttribute('spellcheck')).toBe('false');
    expect(passInput.getAttribute('data-lpignore')).toBe('true');
    expect(passInput.getAttribute('data-1p-ignore')).toBe('true');
    expect(passInput.getAttribute('data-bwignore')).toBe('true');
    expect(passInput.getAttribute('data-form-type')).toBe('other');

    const confirmInput = screen.getByTestId('lock-confirm-password-input');
    expect(confirmInput.getAttribute('autocomplete')).toBe('off');
    expect(confirmInput.getAttribute('data-lpignore')).toBe('true');

    const secretInput = screen.getByTestId('lock-secret-key-input');
    expect(secretInput.getAttribute('autocomplete')).toBe('off');
    expect(secretInput.getAttribute('data-lpignore')).toBe('true');
  });
});
