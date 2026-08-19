/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsRecoverySection } from './SettingsRecoverySection';
import * as recoveryKeyModule from '../../lib/recoveryKey';
import * as passwordHintModule from '../../lib/passwordHint';

vi.mock('../../lib/recoveryKey');
vi.mock('../../lib/passwordHint');
vi.mock('../../lib/desktopFiles', () => ({
  isNativeFileDialogSupported: () => false,
  saveDesktopExportFile: vi.fn(),
}));

const mockT = (key: string) => key;

describe('SettingsRecoverySection', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders recovery key and password hint controls', () => {
    vi.mocked(recoveryKeyModule.isRecoveryKeySetup).mockReturnValue(false);
    vi.mocked(passwordHintModule.getPasswordHint).mockReturnValue('Hint 123');

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    expect(screen.getByRole('heading', { name: 'settings.recovery.title' })).toBeDefined();
  });

  it('generates recovery key, copies words, and saves recovery key', async () => {
    const mockWords = [
      'abandon', 'ability', 'able', 'about', 'above', 'absent',
      'absorb', 'abstract', 'absurd', 'abuse', 'access', 'accident',
      'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire',
      'across', 'act', 'action', 'actor', 'actress', 'actual'
    ];
    vi.mocked(recoveryKeyModule.generateRecoveryWords).mockReturnValue(mockWords);
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

  it('handles saving and clearing password hint', () => {
    vi.mocked(passwordHintModule.setPasswordHint).mockReturnValue({ saved: true, warning: false });

    render(<SettingsRecoverySection t={mockT as any} masterPassword="pass" />);

    const hintInput = screen.getByPlaceholderText('settings.recovery.hintPlaceholder');
    fireEvent.change(hintInput, { target: { value: 'New Hint' } });

    const saveHintBtn = screen.getByText('settings.recovery.hintSave');
    fireEvent.click(saveHintBtn);

    expect(passwordHintModule.setPasswordHint).toHaveBeenCalledWith('New Hint', 'pass');
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
});
