/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_NAME } from '../lib/branding';
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
});
