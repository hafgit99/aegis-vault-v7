/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import type { VaultItem } from '../types';
import LoginDetail from './LoginDetail';

const loginItem: VaultItem = {
  id: 'login-1',
  title: 'Aegis Mail',
  username: 'ada@example.com',
  password: 'CorrectHorseBatteryStaple',
  url: 'https://example.com',
  totpSecret: 'JBSWY3DPEHPK3PXP',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'login',
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('LoginDetail', () => {
  it('renders nothing for non-login items', () => {
    const { container } = render(
      <LoginDetail
        item={{ ...loginItem, category: 'card' }}
        copiedField={null}
        isPasswordRevealed={false}
        totpCountdown={30}
        onTogglePasswordReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(container.textContent).toBe('');
  });

  it('renders username, masked password and TOTP countdown', async () => {
    render(
      <LoginDetail
        item={loginItem}
        copiedField={null}
        isPasswordRevealed={false}
        totpCountdown={17}
        onTogglePasswordReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText('KULLANICI ADI VEYA E-POSTA')).toBeTruthy();
    expect(screen.getByText('ada@example.com')).toBeTruthy();
    expect(screen.getByText('••••••••••••••••')).toBeTruthy();
    expect(screen.getByText('17 sn kaldı')).toBeTruthy();
    expect(screen.getByText('mfa yetkin')).toBeTruthy();

    await screen.findByTitle('Doğrulama Kodunu Kopyala');
  });

  it('reveals password when requested', () => {
    render(
      <LoginDetail
        item={loginItem}
        copiedField={null}
        isPasswordRevealed={true}
        totpCountdown={30}
        onTogglePasswordReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText('CorrectHorseBatteryStaple')).toBeTruthy();
  });

  it('shows an empty-password fallback and copies an empty password safely', () => {
    const onCopyText = vi.fn();

    render(
      <LoginDetail
        item={{ ...loginItem, password: undefined }}
        copiedField={null}
        isPasswordRevealed={true}
        totpCountdown={30}
        onTogglePasswordReveal={vi.fn()}
        onCopyText={onCopyText}
      />,
    );

    expect(screen.getByText('(Boş Şifre)')).toBeTruthy();

    const copyButtons = screen.getAllByTitle('Kopyala');
    fireEvent.click(copyButtons[1]!);

    expect(onCopyText).toHaveBeenCalledWith('', 'password');
  });

  it('shows a fallback when TOTP is not configured', () => {
    render(
      <LoginDetail
        item={{ ...loginItem, totpSecret: '' }}
        copiedField={null}
        isPasswordRevealed={false}
        totpCountdown={30}
        onTogglePasswordReveal={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText(/OTP kurulumu aktif değil/)).toBeTruthy();
  });

  it('shows an explicit warning for unsupported TOTP settings without exposing a copy action', async () => {
    const onCopyText = vi.fn();

    render(
      <LoginDetail
        item={{ ...loginItem, totpSecret: 'otpauth://totp/Aegis:test@example.com?secret=JBSWY3DPEHPK3PXP&digits=10' }}
        copiedField={null}
        isPasswordRevealed={false}
        totpCountdown={30}
        onTogglePasswordReveal={vi.fn()}
        onCopyText={onCopyText}
      />,
    );

    expect(await screen.findByText(/TOTP ayar/)).toBeTruthy();
    expect(screen.queryByTitle('Doğrulama Kodunu Kopyala')).toBeNull();
    expect(onCopyText).not.toHaveBeenCalled();
  });

  it('fires copy and reveal actions', () => {
    const onTogglePasswordReveal = vi.fn();
    const onCopyText = vi.fn();

    render(
      <LoginDetail
        item={loginItem}
        copiedField={null}
        isPasswordRevealed={false}
        totpCountdown={30}
        onTogglePasswordReveal={onTogglePasswordReveal}
        onCopyText={onCopyText}
      />,
    );

    const copyButtons = screen.getAllByTitle('Kopyala');
    fireEvent.click(copyButtons[0]!);
    fireEvent.click(screen.getByTitle('Göster'));
    fireEvent.click(copyButtons[1]!);
    fireEvent.click(screen.getByTitle('Doğrulama Kodunu Kopyala'));

    expect(onCopyText).toHaveBeenCalledWith('ada@example.com', 'username');
    expect(onTogglePasswordReveal).toHaveBeenCalledTimes(1);
    expect(onCopyText).toHaveBeenCalledWith('CorrectHorseBatteryStaple', 'password');
    expect(onCopyText).toHaveBeenCalledWith(expect.any(String), 'totp');
  });

  it('renders copied states for username, password, and TOTP fields', () => {
    ['username', 'password', 'totp'].forEach((copiedField) => {
      const { container, unmount } = render(
        <LoginDetail
          item={loginItem}
          copiedField={copiedField}
          isPasswordRevealed={copiedField === 'password'}
          totpCountdown={30}
          onTogglePasswordReveal={vi.fn()}
          onCopyText={vi.fn()}
        />,
      );

      expect(container.querySelector('.text-brand-tertiary')).toBeTruthy();
      unmount();
    });
  });

  it('renders login detail copy in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <LoginDetail
          item={{ ...loginItem, password: undefined, totpSecret: '' }}
          copiedField={null}
          isPasswordRevealed={true}
          totpCountdown={17}
          onTogglePasswordReveal={vi.fn()}
          onCopyText={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('USERNAME OR EMAIL')).toBeTruthy();
    expect(screen.getByText('PASSWORD')).toBeTruthy();
    expect(screen.getByText('(Empty Password)')).toBeTruthy();
    expect(screen.getByTitle('Hide')).toBeTruthy();
    expect(screen.getAllByTitle('Copy').length).toBeGreaterThan(0);
    expect(screen.getByText(/OTP is not active/)).toBeTruthy();
  });
});
