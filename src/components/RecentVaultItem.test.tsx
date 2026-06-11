/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import RecentVaultItem from './RecentVaultItem';

const recentItem: VaultItem = {
  id: 'recent-1',
  title: 'Internal Wiki',
  username: 'team@example.com',
  password: 'secret-value',
  url: 'https://wiki.example.com',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
};

afterEach(() => {
  cleanup();
});

describe('RecentVaultItem', () => {
  it('renders the item identity', () => {
    render(<RecentVaultItem item={recentItem} copiedField={null} onSelect={vi.fn()} onCopyText={vi.fn()} />);

    expect(screen.getByText('Internal Wiki')).toBeTruthy();
    expect(screen.getByText('team@example.com')).toBeTruthy();
    expect(screen.getByText('I')).toBeTruthy();
  });

  it('notifies parent when selected', () => {
    const onSelect = vi.fn();

    render(<RecentVaultItem item={recentItem} copiedField={null} onSelect={onSelect} onCopyText={vi.fn()} />);
    fireEvent.click(screen.getByText('Internal Wiki'));

    expect(onSelect).toHaveBeenCalledWith(recentItem);
  });

  it('copies username and password with stable recent fields', () => {
    const onCopyText = vi.fn();

    render(<RecentVaultItem item={recentItem} copiedField={null} onSelect={vi.fn()} onCopyText={onCopyText} />);
    fireEvent.click(screen.getByTitle('Kullanıcı Adını Kopyala'));
    fireEvent.click(screen.getByTitle('Şifreyi Kopyala'));

    expect(onCopyText).toHaveBeenCalledWith('team@example.com', 'recent-user-recent-1');
    expect(onCopyText).toHaveBeenCalledWith('secret-value', 'recent-pass-recent-1');
  });

  it('shows copied state for the active field', () => {
    render(
      <RecentVaultItem
        item={recentItem}
        copiedField="recent-pass-recent-1"
        onSelect={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('renders a known platform logo when available', () => {
    render(
      <RecentVaultItem
        item={{ ...recentItem, title: 'GitHub', url: 'https://github.com' }}
        copiedField={null}
        onSelect={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    const logo = screen.getByAltText('GitHub') as HTMLImageElement;
    expect(logo.src).toContain('googleusercontent.com');
  });

  it('shows copied state for the username field', () => {
    render(
      <RecentVaultItem
        item={recentItem}
        copiedField="recent-user-recent-1"
        onSelect={vi.fn()}
        onCopyText={vi.fn()}
      />,
    );

    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('copies an empty string when the password is missing', () => {
    const onCopyText = vi.fn();

    render(
      <RecentVaultItem
        item={{ ...recentItem, password: undefined }}
        copiedField={null}
        onSelect={vi.fn()}
        onCopyText={onCopyText}
      />,
    );

    fireEvent.click(screen.getByTitle('Şifreyi Kopyala'));

    expect(onCopyText).toHaveBeenCalledWith('', 'recent-pass-recent-1');
  });
});
