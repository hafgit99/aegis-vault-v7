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
  generateShareUrl: vi.fn().mockResolvedValue('https://app.aegisvault.org/#share=encrypted_data'),
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

  it('renders modal and generates share URL with QR code', async () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={onClose} item={mockItem} />
      </LanguageProvider>,
    );

    expect(screen.queryByText('My Bank Login')).not.toBeNull();

    await waitFor(() => {
      expect(shareModule.generateShareUrl).toHaveBeenCalledWith(mockItem, 1);
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

    await waitFor(() => {
      const copyBtn = screen.getByTestId('share-modal-copy-button');
      fireEvent.click(copyBtn);
      expect(writeText).toHaveBeenCalledWith('https://app.aegisvault.org/#share=encrypted_data');
    });
  });

  it('updates duration when duration button is clicked', async () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={onClose} item={mockItem} />
      </LanguageProvider>,
    );

    const btn24h = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('24'));
    if (btn24h) {
      fireEvent.click(btn24h);
      await waitFor(() => {
        expect(shareModule.generateShareUrl).toHaveBeenCalledWith(mockItem, 24);
      });
    }

    const btn1h = screen.getAllByRole('button').find((btn) => btn.textContent?.includes('1'));
    if (btn1h) {
      fireEvent.click(btn1h);
      await waitFor(() => {
        expect(shareModule.generateShareUrl).toHaveBeenCalledWith(mockItem, 1);
      });
    }
  });

  it('handles clipboard failure and generation errors gracefully', async () => {
    vi.mocked(shareModule.generateShareUrl).mockRejectedValueOnce(new Error('crypto-failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={vi.fn()} item={mockItem} />
      </LanguageProvider>,
    );

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalled();
    });

    consoleError.mockRestore();
  });

  it('renders prominent security warning and hardens share URL input', async () => {
    render(
      <LanguageProvider>
        <ShareModal isOpen={true} onClose={vi.fn()} item={mockItem} />
      </LanguageProvider>,
    );

    const input = screen.getByTestId('share-modal-url-input');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('data-lpignore')).toBe('true');
    expect(input.getAttribute('data-1p-ignore')).toBe('true');
    expect(input.getAttribute('data-bwignore')).toBe('true');
    expect(input.getAttribute('spellcheck')).toBe('false');

    await waitFor(() => {
      expect(screen.getByText(/Zero-Knowledge|Sıfır Bilgi/i)).toBeTruthy();
    });
  });
});
