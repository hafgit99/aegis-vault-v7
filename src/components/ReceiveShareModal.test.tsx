/**
 * @vitest-environment jsdom
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ReceiveShareModal from './ReceiveShareModal';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { DecryptedSharePayload } from '../lib/share';

const mockPayload: DecryptedSharePayload = {
  title: 'Shared GitHub Login',
  username: 'octocat',
  password: 'supersecretpassword',
  url: 'https://github.com',
  notes: 'My developer key',
  category: 'login',
  expiresAt: Date.now() + 1000 * 60 * 30, // 30 mins
};

describe('ReceiveShareModal', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders decrypted shared payload details', () => {
    const onClose = vi.fn();
    const onImport = vi.fn();

    render(
      <LanguageProvider>
        <ReceiveShareModal isOpen={true} onClose={onClose} payload={mockPayload} onImport={onImport} />
      </LanguageProvider>,
    );

    expect(screen.queryByText('Shared GitHub Login')).not.toBeNull();
    expect(screen.queryByText('octocat')).not.toBeNull();
  });

  it('imports shared item into vault on import button click', async () => {
    const onClose = vi.fn();
    const onImport = vi.fn().mockResolvedValue(undefined);

    render(
      <LanguageProvider>
        <ReceiveShareModal isOpen={true} onClose={onClose} payload={mockPayload} onImport={onImport} />
      </LanguageProvider>,
    );

    const importBtn = screen.getByTestId('receive-share-save-button');
    await act(async () => {
      fireEvent.click(importBtn);
    });

    await waitFor(() => {
      expect(onImport).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Shared GitHub Login',
          username: 'octocat',
        }),
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('handles expired share payloads', () => {
    const expiredPayload: DecryptedSharePayload = {
      ...mockPayload,
      expiresAt: Date.now() - 10000,
    };

    render(
      <LanguageProvider>
        <ReceiveShareModal isOpen={true} onClose={vi.fn()} payload={expiredPayload} onImport={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.queryByText(/süresi doldu|expired/i)).not.toBeNull();
  });
});
