/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
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

  it('renders username, masked password and TOTP countdown', () => {
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
    fireEvent.click(copyButtons[0]);
    fireEvent.click(screen.getByTitle('Göster'));
    fireEvent.click(copyButtons[1]);
    fireEvent.click(screen.getByTitle('Doğrulama Kodunu Kopyala'));

    expect(onCopyText).toHaveBeenCalledWith('ada@example.com', 'username');
    expect(onTogglePasswordReveal).toHaveBeenCalledTimes(1);
    expect(onCopyText).toHaveBeenCalledWith('CorrectHorseBatteryStaple', 'password');
    expect(onCopyText).toHaveBeenCalledWith(expect.any(String), 'totp');
  });
});
