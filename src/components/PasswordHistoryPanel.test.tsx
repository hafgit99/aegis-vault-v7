/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import PasswordHistoryPanel from './PasswordHistoryPanel';
import type { VaultItem } from '../types';

const mockItem: VaultItem = {
  id: 'item-1',
  title: 'Test Service',
  username: 'user@test.com',
  password: 'CurrentPassword123',
  url: 'https://test.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-06-01',
  category: 'login',
  passwordHistory: [
    { password: 'OldPassword1', changedAt: '2026-03-01T10:00:00.000Z' },
    { password: 'OldPassword2', changedAt: '2026-01-01T10:00:00.000Z' },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PasswordHistoryPanel', () => {
  it('does not render for non-login items', () => {
    render(<PasswordHistoryPanel item={{ ...mockItem, category: 'card' }} />);
    expect(screen.queryByTestId('password-history-panel')).toBeNull();
  });

  it('renders collapsed state with entry count', () => {
    render(
      <LanguageProvider>
        <PasswordHistoryPanel item={mockItem} />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('password-history-panel')).toBeTruthy();
    expect(screen.getByText('Şifre Geçmişi')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('expands on toggle and shows masked entries', () => {
    render(
      <LanguageProvider>
        <PasswordHistoryPanel item={mockItem} />
      </LanguageProvider>,
    );

    const toggle = screen.getByTestId('password-history-toggle');
    fireEvent.click(toggle);

    expect(screen.getByTestId('password-history-item-0')).toBeTruthy();
    expect(screen.getByTestId('password-history-item-1')).toBeTruthy();
    // Initially masked
    expect(screen.queryByText('OldPassword1')).toBeNull();
  });

  it('reveals password when reveal button is clicked', () => {
    render(
      <LanguageProvider>
        <PasswordHistoryPanel item={mockItem} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('password-history-toggle'));

    const revealBtn = screen.getByTestId('password-history-reveal-0');
    fireEvent.click(revealBtn);

    expect(screen.getByText('OldPassword1')).toBeTruthy();
  });

  it('calls onCopyText when copy button is clicked', () => {
    const onCopyText = vi.fn();
    render(
      <LanguageProvider>
        <PasswordHistoryPanel item={mockItem} onCopyText={onCopyText} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('password-history-toggle'));

    const copyBtn = screen.getByTestId('password-history-copy-0');
    fireEvent.click(copyBtn);

    expect(onCopyText).toHaveBeenCalledWith('OldPassword1', 'history_password_0');
  });

  it('shows empty message when history is empty', () => {
    render(
      <LanguageProvider>
        <PasswordHistoryPanel item={{ ...mockItem, passwordHistory: [] }} />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByTestId('password-history-toggle'));
    expect(screen.getByText('Kayıtlı önceki şifre bulunmuyor')).toBeTruthy();
  });
});
