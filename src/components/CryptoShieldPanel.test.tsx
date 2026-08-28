/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getArgon2DegradationInfo } from '../lib/argon2id';
import type { Argon2DegradationInfo } from '../lib/argon2id';
import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import CryptoShieldPanel from './CryptoShieldPanel';

vi.mock('../lib/argon2id', () => ({
  getArgon2DegradationInfo: vi.fn(() => null),
  subscribeArgon2Degradation: vi.fn(() => () => {}),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('CryptoShieldPanel', () => {
  beforeEach(() => {
    vi.mocked(getArgon2DegradationInfo).mockReturnValue(null);
  });

  it('renders the local encryption status details', () => {
    render(<CryptoShieldPanel />);

    expect(screen.getByText('Kriptoloji Kalkanı Bilgileri')).toBeTruthy();
    expect(screen.getByText('Durum: Aktif')).toBeTruthy();
    expect(screen.getByText('WebCrypto AES-256-GCM')).toBeTruthy();
    expect(screen.getByText('Yerel Zero-Knowledge')).toBeTruthy();
    expect(screen.getByText('Argon2id: 64 MiB, 4 geçiş')).toBeTruthy();
    expect(screen.getByText('Aegis Kalkanı Koruyor')).toBeTruthy();
  });

  it('renders encryption details in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'zh');

    render(
      <LanguageProvider>
        <CryptoShieldPanel />
      </LanguageProvider>,
    );

    expect(screen.getByText('密码学防护详情')).toBeTruthy();
    expect(screen.getByText('状态：已启用')).toBeTruthy();
    expect(screen.getByText('WebCrypto AES-256-GCM')).toBeTruthy();
    expect(screen.getByText('Argon2id：64 MiB，4 次传递')).toBeTruthy();
    expect(screen.getByText('Aegis 防护正在保护')).toBeTruthy();
  });

  it('hides the degradation warning while the KDF runs at full profile', () => {
    render(<CryptoShieldPanel />);

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a visible warning when Argon2id degrades to a weaker memory profile (D2)', () => {
    const degraded: Argon2DegradationInfo = {
      degraded: true,
      requestedMemoryKiB: 32768,
      activeMemoryKiB: 8192,
      timestamp: Date.now(),
      writeBlocked: true,
    };
    vi.mocked(getArgon2DegradationInfo).mockReturnValue(degraded);

    render(<CryptoShieldPanel />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeTruthy();
    expect(screen.getByText('KDF Bellek Düşürmesi Etkin')).toBeTruthy();
    expect(screen.getByText('Argon2id: 8 / 32 MiB')).toBeTruthy();
    expect(screen.getByText('Kasa yazımı engellendi')).toBeTruthy();
  });

  it('labels reduced security instead of write blocking when writes stay permitted', () => {
    const degraded: Argon2DegradationInfo = {
      degraded: true,
      requestedMemoryKiB: 32768,
      activeMemoryKiB: 16384,
      timestamp: Date.now(),
      writeBlocked: false,
    };
    vi.mocked(getArgon2DegradationInfo).mockReturnValue(degraded);

    render(<CryptoShieldPanel />);

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Azaltılmış KDF güvenliği')).toBeTruthy();
  });
});
