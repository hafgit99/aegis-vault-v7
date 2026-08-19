/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * @vitest-environment jsdom
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import PasswordConfirmModal from './PasswordConfirmModal';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';

describe('PasswordConfirmModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    cleanup();
  });
  it('renders masked password input by default with eye toggle icon', () => {
    render(
      <LanguageProvider>
        <PasswordConfirmModal
          isOpen={true}
          onConfirm={vi.fn()}
          onCancel={vi.fn()}
        />
      </LanguageProvider>
    );

    const input = screen.getByPlaceholderText('••••••••••••') as HTMLInputElement;
    expect(input.type).toBe('password');

    const eyeButton = screen.getByTitle('Şifreyi Göster');
    expect(eyeButton).toBeDefined();

    fireEvent.click(eyeButton);
    expect(input.type).toBe('text');

    const hideButton = screen.getByTitle('Şifreyi Gizle');
    expect(hideButton).toBeDefined();
    fireEvent.click(hideButton);
    expect(input.type).toBe('password');
  });

  it('submits password when user clicks confirm', async () => {
    window.localStorage.setItem(languageStorageKey, 'en');
    const onConfirm = vi.fn();
    render(
      <LanguageProvider>
        <PasswordConfirmModal
          isOpen={true}
          onConfirm={onConfirm}
          onCancel={vi.fn()}
        />
      </LanguageProvider>
    );

    const input = screen.getByPlaceholderText('••••••••••••');
    fireEvent.change(input, { target: { value: 'MySecretPassword123' } });

    const submitBtn = screen.getByRole('button', { name: /confirm/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith('MySecretPassword123');
    });
  });
});
