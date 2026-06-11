/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import SecurityAudit from './SecurityAudit';

afterEach(() => {
  cleanup();
});

const makeItem = (overrides: Partial<VaultItem>): VaultItem => ({
  id: overrides.id ?? 'item-1',
  title: overrides.title ?? 'Example',
  username: overrides.username ?? 'user@example.com',
  password: overrides.password ?? 'StrongPass123!@#',
  url: overrides.url ?? 'https://example.com',
  createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
  category: overrides.category ?? 'login',
  ...overrides,
});

describe('SecurityAudit', () => {
  it('renders the empty secure state with zero risk metrics', () => {
    render(<SecurityAudit items={[]} onSelectItem={vi.fn()} />);

    expect(screen.getByText('%100')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(3);
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
    expect(screen.getByText(/ZAYIF VE RISKLI HESAPLAR \(1\)/)).toBeTruthy();
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
            password: 'Medium123',
          }),
        ]}
        onSelectItem={vi.fn()}
      />,
    );

    expect(screen.getByText(/yile/)).toBeTruthy();
    expect(screen.getByText(/ZAYIF VE RISKLI HESAPLAR \(0\)/)).toBeTruthy();
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
    expect(screen.getByText(/ZAYIF VE RISKLI HESAPLAR \(1\)/)).toBeTruthy();
    expect(screen.getByText(/ORANGE TEKRAR EDEN/)).toBeTruthy();
    expect(screen.getByText('SSH Profile')).toBeTruthy();
    expect(screen.getAllByText('0')).toHaveLength(2);

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
});
