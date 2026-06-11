/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '../lib/branding';
import {
  authenticateBiometric,
  isBiometricEnabled,
  isBiometricSupported,
} from '../lib/biometric';
import {
  isMasterPasswordSet,
  setupMasterPassword,
  verifyMasterPassword,
} from '../lib/storage';
import LockScreen from './LockScreen';

vi.mock('../lib/storage', () => ({
  isMasterPasswordSet: vi.fn(),
  setupMasterPassword: vi.fn(async () => undefined),
  verifyMasterPassword: vi.fn(),
}));

vi.mock('../lib/biometric', () => ({
  authenticateBiometric: vi.fn(),
  isBiometricEnabled: vi.fn(() => false),
  isBiometricSupported: vi.fn(() => false),
}));

function passwordInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll('input[type="password"], input[type="text"]'));
}

beforeEach(() => {
  vi.mocked(isMasterPasswordSet).mockReturnValue(false);
  vi.mocked(verifyMasterPassword).mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.clearAllMocks();
});

describe('LockScreen', () => {
  it('validates minimum master password length during setup', () => {
    render(<LockScreen onUnlock={vi.fn()} />);

    const [password, confirmation] = passwordInputs();
    fireEvent.change(password, { target: { value: '12345' } });
    fireEvent.change(confirmation, { target: { value: '12345' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText('Ana şifre en az 6 karakterden oluşmalıdır.')).toBeTruthy();
    expect(setupMasterPassword).not.toHaveBeenCalled();
  });

  it('sets up the master password and unlocks when confirmation matches', async () => {
    const onUnlock = vi.fn();
    render(<LockScreen onUnlock={onUnlock} />);

    const [password, confirmation] = passwordInputs();
    fireEvent.change(password, { target: { value: 'strong-pass' } });
    fireEvent.change(confirmation, { target: { value: 'strong-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(setupMasterPassword).toHaveBeenCalledWith('strong-pass');
      expect(onUnlock).toHaveBeenCalledTimes(1);
    });
  });

  it('rejects setup when confirmation does not match', () => {
    render(<LockScreen onUnlock={vi.fn()} />);

    const [password, confirmation] = passwordInputs();
    fireEvent.change(password, { target: { value: 'strong-pass' } });
    fireEvent.change(confirmation, { target: { value: 'different-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    expect(screen.getByText(/birbiriyle/)).toBeTruthy();
    expect(setupMasterPassword).not.toHaveBeenCalled();
  });

  it('toggles password visibility in setup mode', () => {
    render(<LockScreen onUnlock={vi.fn()} />);

    const [password, confirmation] = passwordInputs();
    const toggleButtons = Array.from(document.querySelectorAll('form button[type="button"]')) as HTMLButtonElement[];

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

    const [password] = passwordInputs();
    fireEvent.change(password, { target: { value: 'wrong-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.getByText('Hatalı Ana Şifre! Lütfen girilen şifreyi kontrol ederek tekrar deneyiniz.')).toBeTruthy();
      expect(onUnlock).not.toHaveBeenCalled();
    });

    fireEvent.change(password, { target: { value: 'correct-pass' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(verifyMasterPassword).toHaveBeenCalledWith('wrong-pass');
      expect(verifyMasterPassword).toHaveBeenCalledWith('correct-pass');
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
      expect(authenticateBiometric).toHaveBeenCalledTimes(1);
      expect(verifyMasterPassword).toHaveBeenCalledWith('bio-master');
      expect(onUnlock).toHaveBeenCalledTimes(1);
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
