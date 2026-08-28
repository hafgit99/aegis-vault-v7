/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as encryptionModule from '../lib/encryption';
import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { isNativeFileDialogSupported, openDesktopImportFile, saveDesktopExportFile } from '../lib/desktopFiles';
import { isAndroidAutofillSupported, openAndroidAutofillSettings } from '../lib/androidAutofill';
import { disableBiometric, isBiometricEnabled, isBiometricSupported, registerBiometric } from '../lib/biometric';
import { changeMasterPassword, deleteVaultItem, getRememberedAccountSecretKey, getVaultItems, isAccountSecretKeyRequired, migrateActiveVaultStorageToWaSqlite, resetSystem, reseedDemoData, saveVaultItems, verifyMasterPassword } from '../lib/storage';
import { closeVaultSession, openVaultSession } from '../lib/vaultSession';
import type { VaultItem } from '../types';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { saveEmergencyKit } from '../lib/emergencyKit';
import SettingsPanel from './SettingsPanel';

const vaultItems: VaultItem[] = [
  {
    id: 'github',
    title: 'GitHub',
    username: 'hafgit99',
    password: 'secret-password',
    url: 'https://github.com/login',
    category: 'login',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    favorite: false,
  },
  {
    id: 'mail',
    title: 'ProtonMail',
    username: 'hafgit99@proton.me',
    password: 'secret-password',
    url: 'https://mail.proton.me',
    category: 'login',
    createdAt: '2026-01-02',
    updatedAt: '2026-01-02',
    favorite: true,
  },
];

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock('../lib/storage', () => ({
  changeMasterPassword: vi.fn(),
  deleteVaultItem: vi.fn(async () => vaultItems),
  getRememberedAccountSecretKey: vi.fn(() => 'EG7-1111-2222-3333-4444'),
  getVaultItems: vi.fn(async () => vaultItems),
  isAccountSecretKeyRequired: vi.fn(() => false),
  migrateActiveVaultStorageToWaSqlite: vi.fn(),
  resetSystem: vi.fn(),
  reseedDemoData: vi.fn(),
  saveVaultItem: vi.fn(async () => vaultItems),
  saveVaultItems: vi.fn(async () => vaultItems),
  verifyMasterPassword: vi.fn(),
}));

vi.mock('../lib/encryption', async () => {
  const actual = await vi.importActual<typeof encryptionModule>('../lib/encryption');

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
  isAndroidAutofillSupported: vi.fn(() => true),
  openAndroidAutofillSettings: vi.fn(() => false),
}));

vi.mock('../lib/biometric', () => ({
  disableBiometric: vi.fn(),
  isBiometricEnabled: vi.fn(() => false),
  isBiometricSupported: vi.fn(() => false),
  registerBiometric: vi.fn(),
  getBiometricType: vi.fn(() => 'platform'),
  isBiometricAutofillRequireEnabled: vi.fn(() => false),
  setBiometricAutofillRequireEnabled: vi.fn(),
  isBiometricV2UpgradeRequired: vi.fn(() => false),
  isBiometricHardwareBound: vi.fn(() => false),
  dismissBiometricV2UpgradeNotification: vi.fn(),
}));

vi.mock('../lib/emergencyKit', () => ({
  saveEmergencyKit: vi.fn(async () => true),
}));

vi.mock('../lib/attachments', () => ({
  exportAllAttachments: vi.fn(async () => []),
  importAttachments: vi.fn(async () => []),
  deleteAttachments: vi.fn(async () => {}),
  deleteAttachment: vi.fn(async () => {}),
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

function passwordChangeInputs(container: HTMLElement): [HTMLInputElement, HTMLInputElement, HTMLInputElement] {
  const inputs = Array.from(container.querySelectorAll('#pass-change-form input[type="password"]')) as HTMLInputElement[];
  return [inputs[0]!, inputs[1]!, inputs[2]!];
}

function encryptedExportButtons(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll('#encrypted-export-card button')) as HTMLButtonElement[];
}

function dropZone(container: HTMLElement): HTMLElement {
  return container.querySelector('#drop-zone-select') as HTMLElement;
}

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation(async () => null);

  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 jsdom',
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  delete window.__TAURI_INTERNALS__;
  vi.mocked(getRememberedAccountSecretKey).mockReturnValue(null);
  vi.mocked(getVaultItems).mockResolvedValue(vaultItems);
  vi.mocked(isAccountSecretKeyRequired).mockReturnValue(true);
  vi.mocked(isNativeFileDialogSupported).mockReturnValue(false);
  vi.mocked(migrateActiveVaultStorageToWaSqlite).mockResolvedValue({
    status: 'promoted',
    issues: [],
    readinessReport: { status: 'ready', issues: [] },
    smokeResult: { status: 'passed', databaseName: '/aegis-wa-sqlite.desktop.db', vfsName: 'aegis-wa-sqlite-desktop-idb' },
    dryRunResult: null,
    persistentMigrationCandidateResult: null,
    promotionResult: null,
  } as any);
  vi.mocked(openDesktopImportFile).mockResolvedValue(null);
  vi.mocked(reseedDemoData).mockResolvedValue(vaultItems);
  vi.mocked(saveDesktopExportFile).mockResolvedValue(false);
  vi.mocked(saveEmergencyKit).mockResolvedValue(true);
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
    expect(screen.getByText('2 Hours')).toBeTruthy();
    expect(screen.getByText('Device Lock & FIDO2 Security Key')).toBeTruthy();
    expect(screen.getByText(/Integrate OS biometrics/)).toBeTruthy();
    expect(screen.getByText('Status: PASSIVE 🔴')).toBeTruthy();
    expect(screen.getByText('Unlock assistance is disabled. You can sign in only with your master password.')).toBeTruthy();
    expect(screen.getByText('Enable Device Lock (Touch ID / Face ID / Hello)')).toBeTruthy();
    expect(screen.getByText('Enable Security Key (FIDO2 / YubiKey)')).toBeTruthy();
    expect(screen.getByText('Android Autofill')).toBeTruthy();
    expect(screen.getByText('Open Android Autofill Settings')).toBeTruthy();
    expect(screen.getByText('Emergency Kit')).toBeTruthy();
    expect(screen.getByText('Save Kit')).toBeTruthy();
    expect(screen.queryByText(/Chrome may hide Aegis suggestions/)).toBeNull();
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
      expect(encryptDataWithPasswordSecure).toHaveBeenCalledWith(
        JSON.stringify({ version: 7, items: vaultItems, attachments: [] }),
        'master-pass'
      );
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
      expect(encryptDataWithPasswordSecure).toHaveBeenCalledWith(
        JSON.stringify({ version: 7, items: vaultItems, attachments: [] }),
        'backup-pass-12'
      );
    });
  });

  it('shows an encrypted export error when the desktop save dialog is cancelled', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(true);
    openVaultSession('master-pass');
    const { container } = renderSettings();

    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalled();
      expect(container.textContent).toContain('Dosya kaydedilemedi');
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

  it('runs wa-sqlite migration after confirmation and refreshes the vault', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    const { props } = renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByTestId('wa-sqlite-migration-button'));

    await waitFor(() => {
      expect(migrateActiveVaultStorageToWaSqlite).toHaveBeenCalledTimes(1);
      expect(props.onDatabaseChanged).toHaveBeenCalledTimes(1);
      expect(props.onNotify).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    });
    expect(screen.getByTestId('wa-sqlite-migration-message').textContent).toContain('The wa-sqlite storage engine is now active.');
  });

  it('does not run wa-sqlite migration when confirmation is cancelled', () => {
    vi.mocked(window.confirm).mockReturnValueOnce(false);
    renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByTestId('wa-sqlite-migration-button'));

    expect(migrateActiveVaultStorageToWaSqlite).not.toHaveBeenCalled();
  });

  it('shows wa-sqlite blocker issues when migration safety checks stop promotion', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockResolvedValueOnce({
      status: 'blocked',
      issues: ['wa-sqlite-promotion-dry-run-not-run'],
      readinessReport: { status: 'blocked', issues: ['wa-sqlite-promotion-dry-run-not-run'] },
      smokeResult: null,
      dryRunResult: null,
      persistentMigrationCandidateResult: null,
      promotionResult: null,
    } as any);
    renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByTestId('wa-sqlite-migration-button'));

    await waitFor(() => {
      expect(screen.getByTestId('wa-sqlite-migration-message').textContent).toContain('wa-sqlite migration was stopped by safety checks.');
    });
    expect(screen.getByTestId('wa-sqlite-migration-message').textContent).toContain('wa-sqlite-promotion-dry-run-not-run');
  });


  it('blocks wa-sqlite migration on Android before invoking the WASM engine', async () => {
    window.__TAURI_INTERNALS__ = {};
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 15) AegisVault',
    });
    renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByTestId('wa-sqlite-migration-button'));

    await waitFor(() => {
      expect(screen.getByTestId('wa-sqlite-migration-message').textContent).toContain('Android WebView on this device does not provide enough WASM memory for wa-sqlite migration.');
    });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(migrateActiveVaultStorageToWaSqlite).not.toHaveBeenCalled();
  });

  it('shows a session warning when wa-sqlite migration starts without an unlocked vault', async () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    vi.mocked(migrateActiveVaultStorageToWaSqlite).mockRejectedValueOnce(new Error('vault-storage-active-migration-session-required'));
    renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByTestId('wa-sqlite-migration-button'));

    await waitFor(() => {
      expect(screen.getByTestId('wa-sqlite-migration-message').textContent).toContain('An unlocked vault session is required before migration.');
    });
  });

  it('keeps reset safe when the destructive confirmation is cancelled', () => {
    const { container } = renderSettings();

    fireEvent.click(container.querySelector('#danger-zone-section button') as HTMLButtonElement);

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(resetSystem).not.toHaveBeenCalled();
  });

  it('resets the vault and schedules the app reload when destructive confirmation is accepted', () => {
    vi.mocked(window.confirm).mockReturnValueOnce(true);
    vi.mocked(resetSystem).mockImplementationOnce(() => new Promise(() => {}));
    const { container } = renderSettings();

    fireEvent.click(container.querySelector('#danger-zone-section button') as HTMLButtonElement);

    expect(resetSystem).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsPanel Android Autofill controls', () => {
  it('does not render Android Autofill card when unsupported', async () => {
    vi.mocked(isAndroidAutofillSupported).mockReturnValueOnce(false);
    renderSettingsWithLanguage('en');

    expect(screen.queryByText('Android Autofill')).toBeNull();
    expect(screen.queryByText('Open Android Autofill Settings')).toBeNull();
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

    fireEvent.click(screen.getByRole('button', { name: /Touch ID/ }));

    await waitFor(() => {
      expect(container.textContent).toContain('desteklenmiyor');
    });
    expect(registerBiometric).not.toHaveBeenCalled();
  });

  it('registers platform biometrics with the active master password', async () => {
    openVaultSession('master-pass');
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(registerBiometric).mockResolvedValueOnce(undefined);
    const { container } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /Touch ID/ }));

    await waitFor(() => {
      expect(registerBiometric).toHaveBeenCalledWith(
        { masterPassword: 'master-pass', secretKey: null },
        'platform',
      );
      expect(container.textContent).toContain('AKT');
    });
  });

  it('registers FIDO2 security key with the active master password', async () => {
    openVaultSession('master-pass');
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(registerBiometric).mockResolvedValueOnce(undefined);
    const { container } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /YubiKey/ }));

    await waitFor(() => {
      expect(registerBiometric).toHaveBeenCalledWith(
        { masterPassword: 'master-pass', secretKey: null },
        'cross-platform',
      );
      expect(container.textContent).toContain('AKT');
    });
  });

  it('opens master password confirmation modal when biometric registration has no cached password string', async () => {
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /Touch ID/ }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText('••••••••••••')).toBeDefined();
    });
    expect(registerBiometric).not.toHaveBeenCalled();
  });

  it('maps WebAuthn permission errors to user-facing biometric guidance', async () => {
    openVaultSession('master-pass');
    vi.mocked(isBiometricSupported).mockReturnValue(true);
    vi.mocked(registerBiometric).mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
    const { container } = renderSettings();

    fireEvent.click(screen.getByRole('button', { name: /Touch ID/ }));

    await waitFor(() => {
      expect(container.textContent).toContain('WebAuthn');
    });
  });

  it('disables biometrics when currently enabled', async () => {
    vi.mocked(isBiometricEnabled).mockReturnValueOnce(true);
    const { container } = renderSettings();

    fireEvent.click(screen.getByText(/Korumayı/));

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

    fireEvent.click(screen.getByText(/Korumayı/));

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

    fireEvent.click(screen.getByText('Disable Protection'));

    await waitFor(() => {
      expect(container.textContent).toContain('An error occurred during the operation.');
    });
  });
});

describe('SettingsPanel Emergency Kit controls', () => {
  it('shows an error when Secret Key protection is not enabled', async () => {
    vi.mocked(isAccountSecretKeyRequired).mockReturnValueOnce(false);
    const { container } = renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByText('Save Kit'));

    await waitFor(() => {
      expect(container.textContent).toContain('Secret Key protection is not enabled for this vault.');
    });
    expect(saveEmergencyKit).not.toHaveBeenCalled();
  });

  it('requires a valid Secret Key before saving an emergency kit', async () => {
    const { container } = renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByText('Save Kit'));

    await waitFor(() => {
      expect(container.textContent).toContain('Enter a valid A3 Secret Key');
    });
    expect(saveEmergencyKit).not.toHaveBeenCalled();
  });

  it('saves the emergency kit with a remembered Secret Key', async () => {
    const rememberedSecretKey = 'A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-2673';
    vi.mocked(getRememberedAccountSecretKey).mockReturnValueOnce(rememberedSecretKey);
    const { container } = renderSettingsWithLanguage('en');

    fireEvent.click(screen.getByText('Save Kit'));

    await waitFor(() => {
      expect(saveEmergencyKit).toHaveBeenCalledWith(rememberedSecretKey);
      expect(container.textContent).toContain('Emergency kit was saved to the location you selected.');
    });
  });

  it('shows the default save error when emergency kit saving fails without a message', async () => {
    vi.mocked(saveEmergencyKit).mockRejectedValueOnce(new Error());
    const { container } = renderSettingsWithLanguage('en');
    const secretInput = screen.getByPlaceholderText('A3-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX');

    fireEvent.change(secretInput, {
      target: { value: 'A3-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-2673' },
    });
    fireEvent.click(screen.getByText('Save Kit'));

    await waitFor(() => {
      expect(container.textContent).toContain('Emergency kit could not be saved');
      expect(container.textContent).toContain('The file could not be saved.');
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
    vi.useFakeTimers();
    const { container } = renderSettings();

    fireEvent.click(encryptedExportButtons(container)[1]!);
    expect(screen.getByTestId('plain-export-warning')).toBeTruthy();
    expect(saveDesktopExportFile).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'EXPORT' },
    });
    fireEvent.mouseDown(screen.getByTestId('plain-export-confirm-button'));
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.json$/),
        JSON.stringify({ version: 7, items: vaultItems, attachments: [] }, null, 2)
      );
      expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    });
  });

  it('requires explicit confirmation before creating a plain JSON backup', async () => {
    vi.useFakeTimers();
    const { container } = renderSettings();

    fireEvent.click(encryptedExportButtons(container)[1]!);
    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'NOPE' },
    });
    fireEvent.mouseDown(screen.getByTestId('plain-export-confirm-button'));
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    await waitFor(() => {
      expect(container.textContent).toContain('EXPORT');
    });
    expect(saveDesktopExportFile).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it('shows an export error when the save dialog fails', async () => {
    vi.mocked(saveDesktopExportFile).mockRejectedValueOnce(new Error('disk full'));
    vi.useFakeTimers();
    const { container } = renderSettings();

    fireEvent.click(encryptedExportButtons(container)[1]!);
    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'EXPORT' },
    });
    fireEvent.mouseDown(screen.getByTestId('plain-export-confirm-button'));
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    await waitFor(() => {
      expect(container.textContent).toContain('disk full');
    });
  });

  it('shows a plain export error when the desktop save dialog is cancelled', async () => {
    window.__TAURI_INTERNALS__ = {};
    vi.mocked(isNativeFileDialogSupported).mockReturnValue(true);
    vi.mocked(saveDesktopExportFile).mockResolvedValueOnce(false);
    vi.useFakeTimers();
    const { container } = renderSettings();

    fireEvent.click(encryptedExportButtons(container)[1]!);
    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'EXPORT' },
    });
    fireEvent.mouseDown(screen.getByTestId('plain-export-confirm-button'));
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.json$/),
        JSON.stringify({ version: 7, items: vaultItems, attachments: [] }, null, 2)
      );
      expect(container.textContent).toContain('Dosya kaydedilemedi');
    });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
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
    vi.useFakeTimers();
    const { container } = renderSettings();
    const input = fileInput(container);
    const inputClickSpy = vi.spyOn(input, 'click');

    fireEvent.click(encryptedExportButtons(container)[1]!);
    fireEvent.change(screen.getByTestId('plain-export-confirm-input'), {
      target: { value: 'EXPORT' },
    });
    fireEvent.mouseDown(screen.getByTestId('plain-export-confirm-button'));
    vi.advanceTimersByTime(3000);
    vi.useRealTimers();

    await waitFor(() => {
      expect(saveDesktopExportFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.json$/),
        JSON.stringify({ version: 7, items: vaultItems, attachments: [] }, null, 2)
      );
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

  it('rejects a backup file exceeding the 100MB file size limit during import', async () => {
    const { container } = renderSettings();
    
    // Create a mock small file but override size property to 101 MB to avoid memory lags
    const file = new File(['{}'], 'huge_backup.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: 101 * 1024 * 1024 });

    fireEvent.change(fileInput(container), { target: { files: [file] } });

    await waitFor(() => {
      expect(container.textContent).toContain('100MB');
    });
  });

  it('performs rollback of items if attachment saving fails during restore', async () => {
    // Mock saveVaultItems to succeed but importAttachments to fail
    vi.mocked(saveVaultItems).mockResolvedValueOnce(vaultItems);
    const { importAttachments } = await import('../lib/attachments');
    vi.mocked(importAttachments).mockRejectedValueOnce(new Error('IndexedDB storage full'));

    const parsedData = {
      version: 7,
      items: [
        { id: 'new-github', title: 'GitHub New', username: 'new-user' }
      ],
      attachments: [
        {
          id: 'att-fail',
          name: 'doc.txt',
          type: 'text/plain',
          size: 100,
          dataBase64: 'SGVsbG8gV29ybGQ='
        }
      ]
    };

    vi.mocked(decryptDataWithPasswordSecure).mockResolvedValueOnce(JSON.stringify(parsedData));

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

    // Rollback deletes the newly inserted item
    await waitFor(() => {
      expect(deleteVaultItem).toHaveBeenCalledWith('new-github');
    });
  });
});

