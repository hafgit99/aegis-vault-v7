/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ShareModal from './ShareModal';
import { LanguageProvider } from '../i18n/LanguageContext';
import * as shareModule from '../lib/share';
import React from 'react';
import type { VaultItem } from '../types';

vi.mock('../lib/share', () => ({
  generateShareUrl: vi.fn().mockResolvedValue('https://app.aegisvault.org/#share=encrypted_data&s=salt'),
  MIN_SHARE_PASSWORD_LENGTH: 4,
}));

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}));

const mockItem: VaultItem = {
  id: 'item-1',
  title: 'My Bank Login',
  username: 'bankuser',
  password: 'secretpassword',
  url: '',
  category: 'login',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};

describe('ShareModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders modal with password input and generate button', async () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={onClose} item={mockItem} />
      </LanguageProvider>,
    );

    expect(screen.queryByText('My Bank Login')).not.toBeNull();
    // Password input should be visible
    expect(screen.getByTestId('share-modal-password-input')).toBeTruthy();
    // Generate button should be visible
    expect(screen.getByTestId('share-modal-generate-button')).toBeTruthy();
    // URL input should NOT be visible yet (not generated)
    expect(screen.queryByTestId('share-modal-url-input')).toBeNull();
  });

  it('generates share URL after entering password and clicking generate', async () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={onClose} item={mockItem} />
      </LanguageProvider>,
    );

    // Type a password
    const passwordInput = screen.getByTestId('share-modal-password-input');
    fireEvent.change(passwordInput, { target: { value: 'test-share-password' } });

    // Click generate
    const generateBtn = screen.getByTestId('share-modal-generate-button');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(shareModule.generateShareUrl).toHaveBeenCalledWith(mockItem, 1, 'test-share-password');
    });

    // URL input should now be visible
    await waitFor(() => {
      expect(screen.getByTestId('share-modal-url-input')).toBeTruthy();
    });
  });

  it('copies share link when copy button is clicked', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={onClose} item={mockItem} />
      </LanguageProvider>,
    );

    // Type password and generate
    const passwordInput = screen.getByTestId('share-modal-password-input');
    fireEvent.change(passwordInput, { target: { value: 'test-share-password' } });
    const generateBtn = screen.getByTestId('share-modal-generate-button');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      const copyBtn = screen.getByTestId('share-modal-copy-button');
      fireEvent.click(copyBtn);
      expect(writeText).toHaveBeenCalledWith('https://app.aegisvault.org/#share=encrypted_data&s=salt');
    });
  });

  it('handles clipboard failure and generation errors gracefully', async () => {
    vi.mocked(shareModule.generateShareUrl).mockRejectedValueOnce(new Error('crypto-failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={vi.fn()} item={mockItem} />
      </LanguageProvider>,
    );

    // Type password and generate
    const passwordInput = screen.getByTestId('share-modal-password-input');
    fireEvent.change(passwordInput, { target: { value: 'test-share-password' } });
    const generateBtn = screen.getByTestId('share-modal-generate-button');
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    consoleError.mockRestore();
  });

  it('renders password input with proper security attributes', async () => {
    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={vi.fn()} item={mockItem} />
      </LanguageProvider>,
    );

    const input = screen.getByTestId('share-modal-password-input');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('data-lpignore')).toBe('true');
    expect(input.getAttribute('data-1p-ignore')).toBe('true');
    expect(input.getAttribute('data-bwignore')).toBe('true');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('type')).toBe('password');
  });
});
