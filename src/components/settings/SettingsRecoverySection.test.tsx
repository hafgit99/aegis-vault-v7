/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsRecoverySection } from './SettingsRecoverySection';
import * as recoveryKeyModule from '../../lib/recoveryKey';
import * as passwordHintModule from '../../lib/passwordHint';
import * as vaultSessionModule from '../../lib/vaultSession';
import * as desktopFilesModule from '../../lib/desktopFiles';

vi.mock('../../lib/recoveryKey');
vi.mock('../../lib/passwordHint');
vi.mock('../../lib/vaultSession');
vi.mock('../../lib/desktopFiles', () => ({
  isNativeFileDialogSupported: vi.fn(() => false),
  saveDesktopExportFile: vi.fn(),
}));

const mockT = (key: string) => key;

const MOCK_WORDS = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent',
  'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
  'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
  'across', 'act', 'action', 'actor', 'actress', 'actual',
];

describe('SettingsRecoverySection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders recovery key and password hint controls', async () => {
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(false);
    vi.mocked(passwordHintModule.getPasswordHint).mockResolvedValue('Hint 123');

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    expect(screen.getByRole('heading', { name: 'settings.recovery.title' })).toBeDefined();
  });

  it('generates recovery key, copies words, and saves recovery key', async () => {
    vi.mocked(recoveryKeyModule.generateRecoveryWords).mockReturnValue(MOCK_WORDS);
    vi.mocked(recoveryKeyModule.setupRecoveryKey).mockResolvedValue();

    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    // Click generate button
    const generateBtn = screen.getByText('settings.recovery.keyGenerate');
    fireEvent.click(generateBtn);

    expect(screen.getByText('abandon')).toBeDefined();

    // Click copy button
    const copyBtn = screen.getByText('settings.recovery.keyCopy');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();

    // Click save button
    const saveBtn = screen.getByText('settings.recovery.keySave');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(recoveryKeyModule.setupRecoveryKey).toHaveBeenCalled();
    });
  });

  it('handles saving and clearing password hint', async () => {
    vi.mocked(passwordHintModule.getPasswordHint).mockResolvedValue(null);
    vi.mocked(passwordHintModule.setPasswordHint).mockResolvedValue({ saved: true, warning: false });

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    const hintInput = screen.getByPlaceholderText('settings.recovery.hintPlaceholder');
    fireEvent.change(hintInput, { target: { value: 'New Hint' } });

    const saveHintBtn = screen.getByText('settings.recovery.hintSave');
    fireEvent.click(saveHintBtn);

    await waitFor(() => {
      expect(passwordHintModule.setPasswordHint).toHaveBeenCalledWith('New Hint', 'pass');
    });
  });

  it('disables active recovery key when confirmed', () => {
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(true);

    const { container } = render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    // Click trash button (first red button)
    const trashBtn = container.querySelector('.border-red-500\\/20');
    expect(trashBtn).toBeTruthy();
    fireEvent.click(trashBtn!);

    const confirmBtn = screen.getByText('settings.recovery.keyDisable');
    fireEvent.click(confirmBtn);

    expect(recoveryKeyModule.disableRecoveryKey).toHaveBeenCalled();
  });

  it('falls back to the active session password when masterPassword is absent', async () => {
    vi.mocked(vaultSessionModule.withActiveBackupPassword).mockResolvedValue('session-pass');
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(false);
    vi.mocked(recoveryKeyModule.generateRecoveryWords).mockReturnValue(MOCK_WORDS);
    vi.mocked(recoveryKeyModule.setupRecoveryKey).mockResolvedValue();

    render(<SettingsRecoverySection t={mockT as any} masterPassword={null} />);

    fireEvent.click(screen.getByText('settings.recovery.keyGenerate'));
    fireEvent.click(screen.getByText('settings.recovery.keySave'));

    await waitFor(() => {
      expect(recoveryKeyModule.setupRecoveryKey).toHaveBeenCalledWith('session-pass', MOCK_WORDS);
    });
  });

  it('shows the session error when no password can be resolved', async () => {
    vi.mocked(vaultSessionModule.withActiveBackupPassword).mockResolvedValue(null as unknown as string);
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(false);
    vi.mocked(recoveryKeyModule.generateRecoveryWords).mockReturnValue(MOCK_WORDS);

    render(<SettingsRecoverySection t={mockT as any} masterPassword={null} />);

    fireEvent.click(screen.getByText('settings.recovery.keyGenerate'));
    fireEvent.click(screen.getByText('settings.recovery.keySave'));

    await waitFor(() => {
      expect(screen.getByText('settings.recovery.errorNoSession')).toBeTruthy();
    });
    expect(recoveryKeyModule.setupRecoveryKey).not.toHaveBeenCalled();
  });

  it('downloads the recovery words through the native file dialog', async () => {
    vi.mocked(desktopFilesModule.saveDesktopExportFile).mockResolvedValue(true);
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(false);
    vi.mocked(recoveryKeyModule.generateRecoveryWords).mockReturnValue(MOCK_WORDS);

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    fireEvent.click(screen.getByText('settings.recovery.keyGenerate'));
    fireEvent.click(screen.getByText('settings.recovery.keyDownload'));

    await waitFor(() => {
      expect(desktopFilesModule.saveDesktopExportFile).toHaveBeenCalledWith(
        'aegis-vault-recovery-key.txt',
        expect.stringContaining('Recovery Words (24):'),
      );
    });
  });

  it('shows a warning when the saved hint strongly resembles the password', async () => {
    vi.mocked(passwordHintModule.getPasswordHint).mockResolvedValue(null);
    vi.mocked(passwordHintModule.setPasswordHint).mockResolvedValue({ saved: true, warning: true });

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    fireEvent.change(screen.getByPlaceholderText('settings.recovery.hintPlaceholder'), { target: { value: 'H' } });
    fireEvent.click(screen.getByText('settings.recovery.hintSave'));

    await waitFor(() => {
      expect(screen.getByText('settings.recovery.hintWarning')).toBeTruthy();
    });
  });

  it('clears a stored password hint', async () => {
    vi.mocked(passwordHintModule.getPasswordHint).mockResolvedValue('Old hint');
    vi.mocked(passwordHintModule.clearPasswordHint).mockResolvedValue();

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    await screen.findByDisplayValue('Old hint');

    const clearButton = screen
      .getAllByRole('button')
      .find((button) => button.querySelector('.lucide-trash-2'));
    expect(clearButton).toBeTruthy();

    fireEvent.click(clearButton!);

    await waitFor(() => {
      expect(passwordHintModule.clearPasswordHint).toHaveBeenCalled();
    });
    expect((screen.getByPlaceholderText('settings.recovery.hintPlaceholder') as HTMLInputElement).value).toBe('');
  });

  it('tolerates clipboard failures when copying recovery words', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    });
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(false);
    vi.mocked(recoveryKeyModule.generateRecoveryWords).mockReturnValue(MOCK_WORDS);

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    fireEvent.click(screen.getByText('settings.recovery.keyGenerate'));
    fireEvent.click(screen.getByText('settings.recovery.keyCopy'));

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    expect(screen.getByText('settings.recovery.keyCopy')).toBeTruthy();
  });
});
