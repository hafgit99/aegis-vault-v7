/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { isNativeFileDialogSupported, openDesktopImportFile, saveDesktopExportFile } from '../lib/desktopFiles';
import { isAndroidAutofillSupported, openAndroidAutofillSettings } from '../lib/androidAutofill';
import { disableBiometric, isBiometricEnabled, isBiometricSupported, registerBiometric } from '../lib/biometric';
import { changeMasterPassword, getVaultItems, resetSystem, reseedDemoData, saveVaultItem, saveVaultItems, verifyMasterPassword } from '../lib/storage';
import { closeVaultSession, openVaultSession } from '../lib/vaultSession';
import { VaultItem } from '../types';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
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
  changeMasterPassword: vi.fn(),
  getVaultItems: vi.fn(async () => vaultItems),
  resetSystem: vi.fn(),
  reseedDemoData: vi.fn(async () => vaultItems),
  saveVaultItem: vi.fn(async () => vaultItems),
  saveVaultItems: vi.fn(async () => vaultItems),
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
  isNativeFileDialogSupported: vi.fn(() => false),
  openDesktopImportFile: vi.fn(async () => null),
  saveDesktopExportFile: vi.fn(async () => false),
}));

vi.mock('../lib/androidAutofill', () => ({
  isAndroidAutofillEnabled: vi.fn(() => false),
  isAndroidAutofillSupported: vi.fn(() => false),
  openAndroidAutofillSettings: vi.fn(() => false),
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

function renderSettingsWithLanguage(language: 'en' | 'zh') {
  window.localStorage.setItem(languageStorageKey, language);

  const props = {
    autoLockDuration: 60,
    onAutoLockDurationChange: vi.fn(),
    onDatabaseChanged: vi.fn(),
    onNotify: vi.fn(),
  };

  const view = render(
    <LanguageProvider>
      <SettingsPanel {...props} />
    </LanguageProvider>,
  );

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

function encryptedExportButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('#encrypted-export-card button')) as HTMLButtonElement[];
}

function dropZone(container: HTMLElement): HTMLElement {
  return container.querySelector('#drop-zone-select') as HTMLElement;
}

beforeEach(() => {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 jsdom',
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  delete window.__TAURI_INTERNALS__;
  vi.mocked(getVaultItems).mockResolvedValue(vaultItems);
  vi.mocked(isNativeFileDialogSupported).mockReturnValue(false);
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
  localStorage.clear();
  delete window.__TAURI_INTERNALS__;
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 jsdom',
  });
});

describe('SettingsPanel import/export', () => {
  it('renders settings overview and password controls in the selected language', () => {
    renderSettingsWithLanguage('en');

    expect(screen.getByText('Vault Settings')).toBeTruthy();
    expect(screen.getByText('Manage lock timing, encrypted backups, and multi-format imports from this panel.')).toBeTruthy();
    expect(screen.getByText('Vault Statistics')).toBeTruthy();
    expect(screen.getByText('Total Items')).toBeTruthy();
    expect(screen.getByText('Secure Structure')).toBeTruthy();
    expect(screen.getByText('Data Location')).toBeTruthy();
    expect(screen.getByText('Browser Memory')).toBeTruthy();
    expect(screen.getByText('Load Demo Data')).toBeTruthy();
    expect(screen.getByText('Change Master Password')).toBeTruthy();
    expect(screen.getByText('Current Master Password')).toBeTruthy();
    expect(screen.getByText('New Master Password')).toBeTruthy();
    expect(screen.getByText('Confirm New Password')).toBeTruthy();
    expect(screen.getByText('Update Password')).toBeTruthy();
    expect(screen.getByText('Auto-Lock Duration')).toBeTruthy();
    expect(screen.getByText('The app locks itself securely when it stays idle in the background or the selected duration expires.')).toBeTruthy();
    expect(screen.getByText('5 Minutes')).toBeTruthy();
    expect(screen.getByText('Never Lock')).toBeTruthy();
    expect(screen.getByText('Biometric Unlock')).toBeTruthy();
    expect(screen.getByText(/Integrate OS biometrics/)).toBeTruthy();
    expect(screen.getByText('Status: PASSIVE 🔴')).toBeTruthy();
    expect(screen.getByText('Biometric unlock is disabled. You can sign in only with your master password.')).toBeTruthy();
    expect(screen.getByText('Enable Biometrics')).toBeTruthy();
    expect(screen.getByText('Android Autofill')).toBeTruthy();
    expect(screen.getByText('Open Android Autofill Settings')).toBeTruthy();
    expect(screen.getByText('Encrypted Backup Export')).toBeTruthy();
    expect(screen.getByText(/Convert all vault records/)).toBeTruthy();
    expect(screen.getByText('Use my vault master password as the backup password')).toBeTruthy();
    expect(screen.getByText('Encrypted .aegis Backup')).toBeTruthy();
    expect(screen.getByText('Plain Text .json Backup')).toBeTruthy();
    expect(screen.getByText('Universal Import System')).toBeTruthy();
    expect(screen.getByText(/Alongside your own encrypted/)).toBeTruthy();
    expect(screen.getByText('Click to Select or Drag a File')).toBeTruthy();
    expect(screen.getByText('SUPPORTED: .JSON / .CSV / .AEGIS')).toBeTruthy();
    expect(screen.getByText('DANGER ZONE')).toBeTruthy();
    expect(screen.getByText(/permanently deletes every saved password/)).toBeTruthy();
    expect(screen.getByText('Permanently Reset Entire Vault')).toBeTruthy();

    fireEvent.click(screen.getByText('Use my vault master password as the backup password'));

    expect(screen.getByText('Backup Security Password')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter a custom backup password with at least 12 characters')).toBeTruthy();
  });

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
      target: { value: 'backup-pass-12' },
    });
    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(encryptDataWithPasswordSecure).toHaveBeenCalledWith(JSON.stringify(vaultItems), 'backup-pass-12');
    });
  });

  it('does not fall back to browser download when the desktop save dialog is cancelled', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(true);
    openVaultSession('master-pass');
    const { container } = renderSettings();

    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalled();
    });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('imports a file selected through the native desktop dialog', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(true);
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
      expect(saveVaultItems).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'imported-id',
            title: 'Native Import',
            username: 'native@example.com',
            password: 'native-secret',
            url: 'https://native.example.com',
            category: 'login',
          }),
        ])
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
      expect(saveVaultItems).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'imported-id',
            title: 'Imported Mail',
            username: 'mail@example.com',
            password: 'imported-secret',
            url: 'https://mail.example.com',
            category: 'login',
          }),
        ])
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
      expect(saveVaultItems).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'imported-id',
            title: 'Encrypted Import',
            username: 'secure@example.com',
            password: 'decrypted-secret',
          }),
        ])
      );
    });
    expect(props.onDatabaseChanged).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsPanel account and safety controls', () => {
  it('changes the master password after validating old password, length, and confirmation', async () => {
    vi.mocked(window.confirm).mockReturnValue(true);
    vi.mocked(verifyMasterPassword)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    const { container } = renderSettings();
    const [oldPassword, newPassword, confirmPassword] = passwordChangeInputs(container);

    fireEvent.change(oldPassword, { target: { value: 'wrong-old' } });
    fireEvent.change(newPassword, { target: { value: 'new-secret-12' } });
    fireEvent.change(confirmPassword, { target: { value: 'new-secret-12' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('hatal');
    });
    expect(changeMasterPassword).not.toHaveBeenCalled();

    fireEvent.change(oldPassword, { target: { value: 'correct-old' } });
    fireEvent.change(newPassword, { target: { value: 'short' } });
    fireEvent.change(confirmPassword, { target: { value: 'short' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('en az 12');
    });
    expect(changeMasterPassword).not.toHaveBeenCalled();

    fireEvent.change(newPassword, { target: { value: 'new-secret-12' } });
    fireEvent.change(confirmPassword, { target: { value: 'different-secret' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('uyu');
    });
    expect(changeMasterPassword).not.toHaveBeenCalled();

    fireEvent.change(confirmPassword, { target: { value: 'new-secret-12' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(changeMasterPassword).toHaveBeenCalledWith('correct-old', 'new-secret-12');
    });
    expect(container.textContent).toContain('yeniden şifrelendi');
    expect(oldPassword.value).toBe('');
    expect(newPassword.value).toBe('');
    expect(confirmPassword.value).toBe('');
  });

  it('does not change the master password when the re-encryption warning is cancelled', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(true);
    const { container } = renderSettings();
    const [oldPassword, newPassword, confirmPassword] = passwordChangeInputs(container);

    fireEvent.change(oldPassword, { target: { value: 'correct-old' } });
    fireEvent.change(newPassword, { target: { value: 'new-secret-12' } });
    fireEvent.change(confirmPassword, { target: { value: 'new-secret-12' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('yeniden şifrelenecek'));
    });
    expect(changeMasterPassword).not.toHaveBeenCalled();
  });

  it('shows an error when master password rotation fails after confirmation', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    vi.mocked(verifyMasterPassword).mockResolvedValueOnce(true);
    vi.mocked(changeMasterPassword).mockRejectedValueOnce(new Error('rotation failed'));
    const { container } = renderSettings();
    const [oldPassword, newPassword, confirmPassword] = passwordChangeInputs(container);

    fireEvent.change(oldPassword, { target: { value: 'correct-old' } });
    fireEvent.change(newPassword, { target: { value: 'new-secret-12' } });
    fireEvent.change(confirmPassword, { target: { value: 'new-secret-12' } });
    fireEvent.submit(passwordChangeForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('rotation failed');
    });
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

  it('resets the vault and reloads the app when destructive confirmation is accepted', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    const { container } = renderSettings();

    fireEvent.click(container.querySelector('#danger-zone-section button') as HTMLButtonElement);

    expect(resetSystem).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsPanel Android Autofill controls', () => {
  it('shows an unsupported message when Android Autofill bridge is unavailable', async () => {
    const { container } = renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByText('Open Android Autofill Settings'));

    await waitFor(() => {
      expect(container.textContent).toContain('Android Autofill is supported only in the Android 8.0+ Tauri app.');
    });
    expect(openAndroidAutofillSettings).not.toHaveBeenCalled();
  });

  it('opens Android Autofill settings through the native bridge', async () => {
    vi.mocked(isAndroidAutofillSupported).mockReturnValue(true);
    vi.mocked(openAndroidAutofillSettings).mockReturnValue(true);
    const { container } = renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByText('Open Android Autofill Settings'));

    await waitFor(() => {
      expect(openAndroidAutofillSettings).toHaveBeenCalledTimes(1);
      expect(container.textContent).toContain('Android Autofill settings opened.');
    });
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

  it('shows a missing-session error when biometric registration has no active master password', async () => {
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    const { container } = renderSettings();

    fireEvent.click(screen.getByText(/Biyometriyi/));

    await waitFor(() => {
      expect(container.textContent).toContain('Oturum');
    });
    expect(registerBiometric).not.toHaveBeenCalled();
  });

  it('maps WebAuthn permission errors to user-facing biometric guidance', async () => {
    openVaultSession('master-pass');
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(registerBiometric).mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    const { container } = renderSettings();

    fireEvent.click(screen.getByText(/Biyometriyi/));

    await waitFor(() => {
      expect(container.textContent).toContain('WebAuthn');
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

  it('shows a disable error when biometric removal fails', async () => {
    vi.mocked(isBiometricEnabled).mockReturnValueOnce(true);
    vi.mocked(disableBiometric).mockImplementationOnce(() => {
      throw new Error('remove failed');
    });
    const { container } = renderSettings();

    fireEvent.click(screen.getByText(/Biyometriyi/));

    await waitFor(() => {
      expect(container.textContent).toContain('remove failed');
    });
  });

  it('shows the localized fallback when biometric removal fails without a message', async () => {
    vi.mocked(isBiometricEnabled).mockReturnValueOnce(true);
    vi.mocked(disableBiometric).mockImplementationOnce(() => {
      throw new Error();
    });
    const { container } = renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByText('Remove Biometrics'));

    await waitFor(() => {
      expect(container.textContent).toContain('An error occurred during the operation.');
    });
  });
});

describe('SettingsPanel plain export and import errors', () => {
  it('shows an encrypted export error when no active master session exists', async () => {
    const { container } = renderSettings();

    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('ana');
    });
    expect(encryptDataWithPasswordSecure).not.toHaveBeenCalled();
  });

  it('requires a custom encrypted-export password when master password reuse is disabled', async () => {
    const { container } = renderSettings();

    fireEvent.click(container.querySelector('#useMasterCheck') as HTMLInputElement);
    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('alan');
    });
    expect(encryptDataWithPasswordSecure).not.toHaveBeenCalled();
  });

  it('requires a strong custom encrypted-export password', async () => {
    const { container } = renderSettings();

    fireEvent.click(container.querySelector('#useMasterCheck') as HTMLInputElement);
    fireEvent.change(container.querySelector('#encrypted-export-card input[type="password"]') as HTMLInputElement, {
      target: { value: 'short' },
    });
    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('en az 12');
    });
    expect(encryptDataWithPasswordSecure).not.toHaveBeenCalled();
  });

  it('shows an encrypted export error when encryption fails', async () => {
    openVaultSession('master-pass');
    vi.mocked(encryptDataWithPasswordSecure).mockRejectedValueOnce(new Error('encrypt failed'));
    const { container } = renderSettings();

    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(container.textContent).toContain('encrypt failed');
    });
  });

  it('exports a plain JSON backup through the browser fallback', async () => {
    const { container } = renderSettings();

    fireEvent.click(encryptedExportButtons(container)[1]);
    expect(screen.getByTestId('plain-export-warning')).toBeTruthy();
    expect(saveDesktopExportFile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'EXPORT' },
    });
    fireEvent.click(screen.getByTestId('plain-export-confirm-button'));

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalledWith(expect.stringMatching(/\.json$/), JSON.stringify(vaultItems, null, 2));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });
  });

  it('requires explicit confirmation before creating a plain JSON backup', async () => {
    const { container } = renderSettings();

    fireEvent.click(encryptedExportButtons(container)[1]);
    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'NOPE' },
    });
    fireEvent.click(screen.getByTestId('plain-export-confirm-button'));

    await waitFor(() => {
      expect(container.textContent).toContain('EXPORT');
    });
    expect(saveDesktopExportFile).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('shows an export error when the save dialog fails', async () => {
    vi.mocked(saveDesktopExportFile).mockRejectedValueOnce(new Error('disk full'));
    const { container } = renderSettings();

    fireEvent.click(encryptedExportButtons(container)[1]);
    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'EXPORT' },
    });
    fireEvent.click(screen.getByTestId('plain-export-confirm-button'));

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

  it('shows localized importer errors in the selected language', async () => {
    const { container } = renderSettingsWithLanguage('en');
    const file = new File(['not,a,supported,backup'], 'broken.csv', { type: 'text/csv' });

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() => {
      expect(container.textContent).toContain('CSV file is empty or missing a header row.');
    });
  });
});

describe('SettingsPanel import interaction states', () => {
  it('imports a supported JSON backup through drag and drop', async () => {
    const { container, props } = renderSettings();
    const file = new File(
      [
        JSON.stringify([
          {
            title: 'Dropped Import',
            username: 'drop@example.com',
            password: 'dropped-secret',
          },
        ]),
      ],
      'dropped.json',
      { type: 'application/json' },
    );
    const target = dropZone(container);

    fireEvent.dragOver(target);
    fireEvent.drop(target, {
      dataTransfer: {
        files: [file],
      },
    });

    await waitFor(() => {
      expect(saveVaultItems).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            title: 'Dropped Import',
            username: 'drop@example.com',
            password: 'dropped-secret',
          }),
        ])
      );
    });
    expect(props.onDatabaseChanged).toHaveBeenCalledTimes(1);
    expect(target.className).toContain('border-outline-variant');
  });

  it('shows a native file-picker error when desktop import selection fails', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(true);
    vi.mocked(openDesktopImportFile).mockRejectedValueOnce(new Error('picker failed'));
    const { container } = renderSettings();

    fireEvent.click(dropZone(container));

    await waitFor(() => {
      expect(container.textContent).toContain('picker failed');
    });
  });

  it('does not open the browser file picker when desktop import is cancelled in desktop runtime', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(true);
    const { container } = renderSettings();
    const input = fileInput(container);
    const clickSpy = vi.spyOn(input, 'click');

    fireEvent.click(dropZone(container));

    await waitFor(() => {
      expect(openDesktopImportFile).toHaveBeenCalledTimes(1);
    });
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('uses browser import and export fallbacks inside Android Tauri', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(false);
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });
    const { container } = renderSettings();
    const input = fileInput(container);
    const inputClickSpy = vi.spyOn(input, 'click');

    fireEvent.click(encryptedExportButtons(container)[1]);
    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'EXPORT' },
    });
    fireEvent.click(screen.getByTestId('plain-export-confirm-button'));

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalledWith(expect.stringMatching(/\.json$/), JSON.stringify(vaultItems, null, 2));
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(dropZone(container));

    expect(openDesktopImportFile).not.toHaveBeenCalled();
    expect(inputClickSpy).toHaveBeenCalledTimes(1);
  });

  it('highlights and clears the import drop zone during drag events', () => {
    const { container } = renderSettings();
    const target = dropZone(container);

    fireEvent.dragOver(target);

    expect(target.className).toContain('border-brand-primary');

    fireEvent.dragLeave(target);

    expect(target.className).toContain('border-outline-variant');
  });

  it('can cancel a pending encrypted import prompt', async () => {
    const { container } = renderSettings();
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
      expect(container.querySelector('#universal-import-card form')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Vazgeç'));

    await waitFor(() => {
      expect(container.querySelector('#universal-import-card form')).toBeNull();
    });
  });

  it('shows a decrypt password error when submitting an encrypted import without a password', async () => {
    const { container } = renderSettings();
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
      expect(container.querySelector('#universal-import-card form')).toBeTruthy();
    });

    fireEvent.submit(container.querySelector('#universal-import-card form') as HTMLFormElement);

    await waitFor(() => {
      expect(container.textContent).toContain('Parola');
    });
    expect(decryptDataWithPasswordSecure).not.toHaveBeenCalled();
  });

  it('shows a decrypt error when an encrypted import does not contain a list', async () => {
    vi.mocked(decryptDataWithPasswordSecure).mockResolvedValueOnce(JSON.stringify({ title: 'not a list' }));
    const { container } = renderSettings();
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
      expect(container.querySelector('#universal-import-card form')).toBeTruthy();
    });

    fireEvent.change(container.querySelector('input[placeholder*="Kilidi"]') as HTMLInputElement, {
      target: { value: 'backup-pass' },
    });
    fireEvent.submit(container.querySelector('#universal-import-card form') as HTMLFormElement);

    await waitFor(() => {
      expect(container.textContent).toContain('liste');
    });
    expect(saveVaultItems).not.toHaveBeenCalled();
  });
});
