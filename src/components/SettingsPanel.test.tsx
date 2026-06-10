/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decryptDataWithPasswordSecure, encryptDataWithPasswordSecure } from '../lib/encryption';
import { saveVaultItem } from '../lib/storage';
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
  getVaultItems: vi.fn(() => vaultItems),
  resetSystem: vi.fn(),
  reseedDemoData: vi.fn(),
  saveVaultItem: vi.fn(),
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

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  closeVaultSession();
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('SettingsPanel import/export', () => {
  it('exports an encrypted .aegis backup with the active master session without sessionStorage', async () => {
    openVaultSession('master-pass');
    const { container } = renderSettings();

    fireEvent.submit(encryptedExportForm(container));

    await waitFor(() => {
      expect(encryptDataWithPasswordSecure).toHaveBeenCalledWith(JSON.stringify(vaultItems), 'master-pass');
    });
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
