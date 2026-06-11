/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { openDesktopImportFile, saveDesktopExportFile } from '../lib/desktopFiles';
import { disableBiometric, isBiometricEnabled, isBiometricSupported, registerBiometric } from '../lib/biometric';
import { getVaultItems, resetSystem, reseedDemoData, saveVaultItem, setupMasterPassword, verifyMasterPassword } from '../lib/storage';
import { closeVaultSession, openVaultSession } from '../lib/vaultSession';
import { VaultItem } from '../types';
import SettingsPanel from './SettingsPanel';

const vaultItems: VaultItem[] = [
  {
    id: 'github',
    title: 'GitHub',
    username: 'hafgit99',
    password: 'secret-password',
    url: 'https://github.com',
    notes: 'primary account',
    createdAt: '2026-06-10',
    updatedAt: '2026-06-10',
    category: 'login',
    favorite: true,
  },
];

vi.mock('../lib/storage', () => ({
  getVaultItems: vi.fn(async () => vaultItems),
  resetSystem: vi.fn(),
  reseedDemoData: vi.fn(async () => vaultItems),
  saveVaultItem: vi.fn(async () => vaultItems),
  setupMasterPassword: vi.fn(),
  verifyMasterPassword: vi.fn(),
}));

vi.mock('../lib/encryption', async () => {
  const actual = await vi.importActual<typeof import('../lib/encryption')>('../lib/encryption');

  return {
    ...actual,
    decryptDataWithPasswordSecure: vi.fn(),
    encryptDataWithPasswordSecure: vi.fn(async () => '{"encrypted":true,"salt":"salt","payload":"payload"}'),
  };
});

vi.mock('../lib/random', () => ({
  secureRandomToken: vi.fn(() => 'imported-id'),
}));

vi.mock('../lib/desktopFiles', () => ({
  openDesktopImportFile: vi.fn(async () => null),
  saveDesktopExportFile: vi.fn(async () => false),
}));

vi.mock('../lib/biometric', () => ({
  disableBiometric: vi.fn(),
  isBiometricEnabled: vi.fn(() => false),
  isBiometricSupported: vi.fn(() => false),
  registerBiometric: vi.fn(),
}));

function renderSettings() {
  const props = {
    autoLockDuration: 60,
    onAutoLockDurationChange: vi.fn(),
    onDatabaseChanged: vi.fn(),
    onNotify: vi.fn(),
  };

  const view = render(<SettingsPanel {...props} />);

  return { ...view, props };
}

function encryptedExportForm(container: HTMLElement): HTMLFormElement {
  return container.querySelector('#encrypted-export-card form') as HTMLFormElement;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

function passwordChangeForm(container: HTMLElement): HTMLFormElement {
  return container.querySelector('#pass-change-form') as HTMLFormElement;
}

function passwordChangeInputs(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll('#pass-change-form input[type="password"]')) as HTMLInputElement[];
}

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  delete window.__TAURI_INTERNALS__;
  vi.mocked(getVaultItems).mockResolvedValue(vaultItems);
  vi.mocked(openDesktopImportFile).mockResolvedValue(null);
  vi.mocked(reseedDemoData).mockResolvedValue(vaultItems);
  vi.mocked(saveDesktopExportFile).mockResolvedValue(false);
  vi.mocked(verifyMasterPassword).mockResolvedValue(true);
});

afterEach(() => {
  closeVaultSession();
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sessionStorage.clear();
  delete window.__TAURI_INTERNALS__;
});

describe('SettingsPanel import/export', () => {
  it('exports an encrypted .aegis backup with the active master session without sessionStorage', async () => {
    openVaultSession('master-pass');
    const { container } = renderSettings();

    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(encryptDataWithPasswordSecure).toHaveBeenCalledWith(JSON.stringify(vaultItems), 'master-pass');
    });
    expect(saveDesktopExportFile).toHaveBeenCalledWith(expect.stringMatching(/\.aegis$/), expect.stringContaining('"encrypted":true'));
    expect(sessionStorage.getItem('aegis_session_master_pass')).toBeNull();
  });

  it('exports an encrypted .aegis backup with a custom password', async () => {
    const { container } = renderSettings();

    fireEvent.click(container.querySelector('#useMasterCheck') as HTMLInputElement);
    fireEvent.change(container.querySelector('#encrypted-export-card input[type="password"]') as HTMLInputElement, {
      target: { value: 'backup-pass' },
    });
    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(encryptDataWithPasswordSecure).toHaveBeenCalledWith(JSON.stringify(vaultItems), 'backup-pass');
    });
  });

  it('does not fall back to browser download when the desktop save dialog is cancelled', async () => {
    window.__TAURI_INTERNALS__ = {};
    openVaultSession('master-pass');
    const { container } = renderSettings();

    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalled();
    });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('imports a file selected through the native desktop dialog', async () => {
    vi.mocked(openDesktopImportFile).mockResolvedValueOnce({
      name: 'native-backup.json',
      contents: JSON.stringify([
        {
          title: 'Native Import',
          username: 'native@example.com',
          password: 'native-secret',
          url: 'https://native.example.com',
          category: 'login',
        },
      ]),
    });
    const { container, props } = renderSettings();

    fireEvent.click(container.querySelector('#drop-zone-select') as HTMLElement);

    await waitFor(() => {
      expect(openDesktopImportFile).toHaveBeenCalledTimes(1);
      expect(saveVaultItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'imported-id',
          title: 'Native Import',
          username: 'native@example.com',
          password: 'native-secret',
          url: 'https://native.example.com',
          category: 'login',
        }),
      );
    });
    expect(props.onDatabaseChanged).toHaveBeenCalledTimes(1);
  });

  it('imports a supported JSON backup and refreshes the database', async () => {
    const { container, props } = renderSettings();
    const file = new File(
      [
        JSON.stringify([
          {
            title: 'Imported Mail',
            username: 'mail@example.com',
            password: 'imported-secret',
            url: 'https://mail.example.com',
            category: 'login',
          },
        ]),
      ],
      'backup.json',
      { type: 'application/json' },
    );

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() => {
      expect(saveVaultItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'imported-id',
          title: 'Imported Mail',
          username: 'mail@example.com',
          password: 'imported-secret',
          url: 'https://mail.example.com',
          category: 'login',
        }),
      );
    });
    expect(props.onDatabaseChanged).toHaveBeenCalledTimes(1);
  });

  it('decrypts an encrypted .aegis import before saving normalized items', async () => {
    vi.mocked(decryptDataWithPasswordSecure).mockResolvedValueOnce(
      JSON.stringify([
        {
          title: 'Encrypted Import',
          username: 'secure@example.com',
          password: 'decrypted-secret',
          url: 'https://secure.example.com',
          category: 'login',
        },
      ]),
    );
    const { container, props } = renderSettings();
    const file = new File(
      [
        JSON.stringify({
          version: '1.2',
          kdf: 'Argon2id',
          salt: 'salt',
          payload: 'ciphertext',
          iv: 'iv',
          tag: 'tag',
        }),
      ],
      'secure.aegis',
      { type: 'application/json' },
    );

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() => {
      expect(container.querySelector('input[placeholder*="Kilidi"]')).toBeTruthy();
    });

    fireEvent.change(container.querySelector('input[placeholder*="Kilidi"]') as HTMLInputElement, {
      target: { value: 'backup-pass' },
    });
    fireEvent.submit(container.querySelector('#universal-import-card form') as HTMLFormElement);

    await waitFor(() => {
      expect(decryptDataWithPasswordSecure).toHaveBeenCalledWith(
        expect.stringContaining('"payload":"ciphertext"'),
        'backup-pass',
      );
      expect(saveVaultItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'imported-id',
          title: 'Encrypted Import',
          username: 'secure@example.com',
          password: 'decrypted-secret',
        }),
      );
    });
    expect(props.onDatabaseChanged).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsPanel account and safety controls', () => {
  it('changes the master password after validating old password, length, and confirmation', async () => {
    vi.mocked(verifyMasterPassword)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    const { container } = renderSettings();
    const [oldPassword, newPassword, confirmPassword] = passwordChangeInputs(container);

    fireEvent.change(oldPassword, { target: { value: 'wrong-old' } });
    fireEvent.change(newPassword, { target: { value: 'new-secret' } });
    fireEvent.change(confirmPassword, { target: { value: 'new-secret' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('hatal');
    });
    expect(setupMasterPassword).not.toHaveBeenCalled();

    fireEvent.change(oldPassword, { target: { value: 'correct-old' } });
    fireEvent.change(newPassword, { target: { value: 'short' } });
    fireEvent.change(confirmPassword, { target: { value: 'short' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('en az 6');
    });
    expect(setupMasterPassword).not.toHaveBeenCalled();

    fireEvent.change(newPassword, { target: { value: 'new-secret' } });
    fireEvent.change(confirmPassword, { target: { value: 'different-secret' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('uyu');
    });
    expect(setupMasterPassword).not.toHaveBeenCalled();

    fireEvent.change(confirmPassword, { target: { value: 'new-secret' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(setupMasterPassword).toHaveBeenCalledWith('new-secret');
    });
    expect(oldPassword.value).toBe('');
    expect(newPassword.value).toBe('');
    expect(confirmPassword.value).toBe('');
  });

  it('changes the auto-lock duration from the option grid', () => {
    const { props } = renderSettings();

    fireEvent.click(screen.getByText('5 Dakika'));

    expect(props.onAutoLockDurationChange).toHaveBeenCalledWith(300);
  });

  it('reseeds demo data and sends a success notification', async () => {
    const { container, props } = renderSettings();

    fireEvent.click(container.querySelector('#demo-reseed-btn') as HTMLButtonElement);

    await waitFor(() => {
      expect(reseedDemoData).toHaveBeenCalledTimes(1);
      expect(props.onDatabaseChanged).toHaveBeenCalledTimes(1);
      expect(props.onNotify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
        }),
      );
    });
  });

  it('keeps reset safe when the destructive confirmation is cancelled', () => {
    const { container } = renderSettings();

    fireEvent.click(container.querySelector('#danger-zone-section button') as HTMLButtonElement);

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(resetSystem).not.toHaveBeenCalled();
  });
});

describe('SettingsPanel biometric controls', () => {
  it('shows an unsupported-device error when enabling biometrics is unavailable', async () => {
    vi.mocked(isBiometricSupported).mockReturnValue(false);
    const { container } = renderSettings();

    fireEvent.click(screen.getByText(/Biyometriyi/));

    await waitFor(() => {
      expect(container.textContent).toContain('desteklenmiyor');
    });
    expect(registerBiometric).not.toHaveBeenCalled();
  });

  it('registers biometrics with the active master password', async () => {
    openVaultSession('master-pass');
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(registerBiometric).mockResolvedValueOnce(undefined);
    const { container } = renderSettings();

    fireEvent.click(screen.getByText(/Biyometriyi/));

    await waitFor(() => {
      expect(registerBiometric).toHaveBeenCalledWith('master-pass');
      expect(container.textContent).toContain('AKT');
    });
  });

  it('disables biometrics when currently enabled', async () => {
    vi.mocked(isBiometricEnabled).mockReturnValueOnce(true);
    const { container } = renderSettings();

    fireEvent.click(screen.getByText(/Biyometriyi/));

    await waitFor(() => {
      expect(disableBiometric).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('devre');
    });
  });
});

describe('SettingsPanel plain export and import errors', () => {
  it('exports a plain JSON backup through the browser fallback', async () => {
    const { container } = renderSettings();
    const buttons = Array.from(container.querySelectorAll('#encrypted-export-card button')) as HTMLButtonElement[];

    fireEvent.click(buttons[1]);

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalledWith(expect.stringMatching(/\.json$/), JSON.stringify(vaultItems, null, 2));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });
  });

  it('shows an export error when the save dialog fails', async () => {
    vi.mocked(saveDesktopExportFile).mockRejectedValueOnce(new Error('disk full'));
    const { container } = renderSettings();
    const buttons = Array.from(container.querySelectorAll('#encrypted-export-card button')) as HTMLButtonElement[];

    fireEvent.click(buttons[1]);

    await waitFor(() => {
      expect(container.textContent).toContain('disk full');
    });
  });

  it('shows an import error for unsupported file contents', async () => {
    const { container } = renderSettings();
    const file = new File(['not,a,supported,backup'], 'broken.csv', { type: 'text/csv' });

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() => {
      expect(container.textContent).toContain('başlık satırı eksik');
    });
  });
});
