/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import type { VaultItem } from '../types';
import SecurityAudit from './SecurityAudit';
import { checkPasswordAgainstHibp } from '../lib/hibp';

vi.mock('../lib/hibp', () => ({
  checkPasswordAgainstHibp: vi.fn(async () => ({ status: 'clean', count: 0 })),
  isHibpCheckEnabled: vi.fn(() => true),
  setHibpCheckEnabled: vi.fn(),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.mocked(checkPasswordAgainstHibp).mockReset();
  vi.mocked(checkPasswordAgainstHibp).mockResolvedValue({ status: 'clean', count: 0 });
});

const makeItem = (overrides: Partial<VaultItem>): VaultItem => {
  const todayStr = new Date().toISOString();
  return {
    id: overrides.id ?? 'item-1',
    title: overrides.title ?? 'Example',
    username: overrides.username ?? 'user@example.com',
    password: overrides.password ?? 'StrongPass123!@#',
    url: overrides.url ?? 'https://example.com',
    createdAt: overrides.createdAt ?? todayStr,
    updatedAt: overrides.updatedAt ?? todayStr,
    category: overrides.category ?? 'login',
    ...overrides,
  };
};

describe('SecurityAudit', () => {
  it('renders the empty secure state with zero risk metrics', () => {
    render(<SecurityAudit items={[]} onSelectItem={vi.fn()} />);

    expect(screen.getByText('%100')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(4);
    expect(screen.getByText(/Kritik derecede/)).toBeTruthy();
    expect(screen.getByText(/tekrar eden parola yoktur/)).toBeTruthy();
  });

  it('renders critical weak and reused groups and selects clicked items', () => {
    const weakItem = makeItem({
      id: 'weak',
      title: 'Legacy Admin',
      username: 'admin',
      password: '123',
    });
    const reusedOne = makeItem({
      id: 'reuse-1',
      title: 'Billing',
      username: 'billing@example.com',
      password: 'SharedPass123!',
    });
    const reusedTwo = makeItem({
      id: 'reuse-2',
      title: 'Invoices',
      username: 'invoice@example.com',
      password: 'SharedPass123!',
    });
    const onSelectItem = vi.fn();

    render(<SecurityAudit items={[weakItem, reusedOne, reusedTwo]} onSelectItem={onSelectItem} />);

    expect(screen.getByText(/Kritik Risk/)).toBeTruthy();
    expect(screen.getByText('Legacy Admin')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
    expect(screen.getByText('Invoices')).toBeTruthy();
    expect(screen.getByText(/ZAYIF VE RİSKLİ HESAPLAR \(1\)/)).toBeTruthy();
    expect(screen.getByText(/TEKRAR EDEN/)).toBeTruthy();

    fireEvent.click(screen.getByText('Legacy Admin'));
    fireEvent.click(screen.getByText('Billing'));

    expect(onSelectItem).toHaveBeenNthCalledWith(1, weakItem);
    expect(onSelectItem).toHaveBeenNthCalledWith(2, reusedOne);
  });

  it('renders the improvement feedback for medium-scoring vaults', () => {
    render(
      <SecurityAudit
        items={[
          makeItem({
            id: 'medium',
            title: 'Medium Password',
            password: 'CorrectHorse12',
          }),
        ]}
        onSelectItem={vi.fn()}
      />,
    );

    expect(screen.getByText(/yile/)).toBeTruthy();
    expect(screen.getByText(/ZAYIF VE RİSKLİ HESAPLAR \(0\)/)).toBeTruthy();
    expect(screen.getByText(/TEKRAR EDEN/)).toBeTruthy();
  });

  it('treats items without a password as weak but not reused or secure', () => {
    const missingPasswordItem = makeItem({
      id: 'missing-password',
      title: 'SSH Profile',
      username: 'ops@example.com',
      password: undefined,
    });
    const onSelectItem = vi.fn();

    render(<SecurityAudit items={[missingPasswordItem]} onSelectItem={onSelectItem} />);

    expect(screen.getByText(/Kritik Risk/)).toBeTruthy();
    expect(screen.getByText(/ZAYIF VE RİSKLİ HESAPLAR \(1\)/)).toBeTruthy();
    expect(screen.getByText(/TEKRAR EDEN ŞİFRELER/)).toBeTruthy();
    expect(screen.getByText('SSH Profile')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(3);

    fireEvent.click(screen.getByText('SSH Profile'));

    expect(onSelectItem).toHaveBeenCalledWith(missingPasswordItem);
  });

  it('renders excellent feedback and secure count for strong unique passwords', () => {
    render(
      <SecurityAudit
        items={[
          makeItem({
            id: 'secure-1',
            title: 'Email',
            password: 'VeryStrongPass123!@#',
          }),
          makeItem({
            id: 'secure-2',
            title: 'Bank',
            password: 'AnotherStrongPass456$%^',
          }),
        ]}
        onSelectItem={vi.fn()}
      />,
    );

    expect(screen.getByText(/kemmel/)).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText('Email')).toBeNull();
    expect(screen.queryByText('Bank')).toBeNull();
  });

  it('renders HIBP pwned password findings without exposing the password', async () => {
    vi.mocked(checkPasswordAgainstHibp).mockImplementation(async (password) => {
      if (password === 'PwnedPass123!') return { status: 'pwned', count: 42 };
      return { status: 'clean', count: 0 };
    });
    const pwnedItem = makeItem({
      id: 'pwned',
      title: 'Forum Account',
      username: 'forum@example.com',
      password: 'PwnedPass123!',
    });
    const onSelectItem = vi.fn();

    render(<SecurityAudit items={[pwnedItem]} onSelectItem={onSelectItem} />);

    await waitFor(() => {
      expect(screen.getByText(/SIZINTI VERİTABANINDA BULUNAN PAROLALAR \(1\)/)).toBeTruthy();
    });
    expect(screen.getByText('Forum Account')).toBeTruthy();
    expect(screen.getByText(/Görülme:/)).toBeTruthy();
    expect(screen.queryByText('PwnedPass123!')).toBeNull();

    fireEvent.click(screen.getByText('Forum Account'));

    expect(onSelectItem).toHaveBeenCalledWith(pwnedItem);
  });

  it('renders security audit labels in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <SecurityAudit
          items={[
            makeItem({
              id: 'weak',
              title: 'Legacy Admin',
              username: 'admin',
              password: '123',
            }),
          ]}
          onSelectItem={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Security Audit')).toBeTruthy();
    expect(screen.getByText(/Continuously analyze your vault/i)).toBeTruthy();
    expect(screen.getByText('Critical Risk Status')).toBeTruthy();
    expect(screen.getByText('Weak Passwords')).toBeTruthy();
    expect(screen.getByText('Reused Passwords')).toBeTruthy();
    expect(screen.getByText('Strong / Secure')).toBeTruthy();
    expect(screen.getByText(/WEAK AND RISKY ACCOUNTS \(1\)/)).toBeTruthy();
    expect(screen.getByText(/REUSED PASSWORDS \(0\)/)).toBeTruthy();
    expect(screen.getByText('Open and Fix')).toBeTruthy();
    expect(screen.getByText('There are no conflicting reused passwords in your vault.')).toBeTruthy();
  });

  it('allows user to toggle HIBP check offline/online', () => {
    render(
      <LanguageProvider>
        <SecurityAudit
          items={[
            makeItem({
              id: 'weak',
              title: 'Legacy Admin',
              username: 'admin',
              password: '123',
            }),
          ]}
          onSelectItem={vi.fn()}
        />
      </LanguageProvider>,
    );

    const toggleBtn = screen.getByTestId('security-audit-hibp-toggle');
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn.textContent).toBe('OPT-IN ON');

    fireEvent.click(toggleBtn);
    expect(toggleBtn.textContent).toBe('OFFLINE');

    fireEvent.click(toggleBtn);
    expect(toggleBtn.textContent).toBe('OPT-IN ON');
  });
});
