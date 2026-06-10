/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { encryptDataWithPasswordSecure } from '../lib/encryption';
import { saveVaultItem } from '../lib/storage';
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

beforeEach(() => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  sessionStorage.clear();
});

describe('SettingsPanel import/export', () => {
  it('exports an encrypted .aegis backup with a custom password', async () => {
    renderSettings();

    fireEvent.click(screen.getByLabelText('Kasa ana şifremi yedekleme parolası yap'));
    fireEvent.change(screen.getByPlaceholderText('En az 6 haneli özel yedek şifresi girin'), {
      target: { value: 'backup-pass' },
    });
    fireEvent.click(screen.getByText('Şifreli .aegis Yedeği'));

    await waitFor(() => {
      expect(encryptDataWithPasswordSecure).toHaveBeenCalledWith(JSON.stringify(vaultItems), 'backup-pass');
    });
    expect(screen.getByText('Askeri düzeyde şifreli yedeğiniz (.aegis) güvenle oluşturuldu ve indirildi.')).toBeTruthy();
  });

  it('imports a supported JSON backup and refreshes the database', async () => {
    const { container, props } = renderSettings();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
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

    fireEvent.change(fileInput, { target: { files: [file] } });

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
    expect(screen.getByText(/1 adet kayıt kasaya yüklendi/)).toBeTruthy();
  });
});
