/**
 * @vitest-environment jsdom
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import CryptoShieldPanel from './CryptoShieldPanel';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('CryptoShieldPanel', () => {
  it('renders the local encryption status details', () => {
    render(<CryptoShieldPanel />);

    expect(screen.getByText('Kriptoloji Kalkanı Bilgileri')).toBeTruthy();
    expect(screen.getByText('Durum: Aktif')).toBeTruthy();
    expect(screen.getByText('WebCrypto AES-256-GCM')).toBeTruthy();
    expect(screen.getByText('Yerel Zero-Knowledge')).toBeTruthy();
    expect(screen.getByText('Argon2id: 128 MiB, 4 geçiş')).toBeTruthy();
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
    expect(screen.getByText('Argon2id：128 MiB，4 次传递')).toBeTruthy();
    expect(screen.getByText('Aegis 防护正在保护')).toBeTruthy();
  });
});
