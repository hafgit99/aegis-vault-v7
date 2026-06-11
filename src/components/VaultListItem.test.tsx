/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import VaultListItem from './VaultListItem';

const vaultItem: VaultItem = {
  id: 'item-1',
  title: 'Internal Wiki',
  username: 'team@example.com',
  password: 'weak',
  url: 'https://wiki.example.com',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
  favorite: true,
};

afterEach(() => {
  cleanup();
});

describe('VaultListItem', () => {
  it('renders vault item identity and password strength', () => {
    render(<VaultListItem item={vaultItem} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.getByText('Internal Wiki')).toBeTruthy();
    expect(screen.getByText('team@example.com')).toBeTruthy();
    expect(screen.getByText('I')).toBeTruthy();
    expect(screen.getByText('WEAK')).toBeTruthy();
  });

  it('notifies parent when selected', () => {
    const onSelect = vi.fn();

    render(<VaultListItem item={vaultItem} isSelected={true} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Internal Wiki'));

    expect(onSelect).toHaveBeenCalledWith(vaultItem);
  });

  it('renders a known platform logo when one is available', () => {
    render(
      <VaultListItem
        item={{ ...vaultItem, title: 'GitHub', url: 'https://github.com', password: 'StrongPassphrase123!' }}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    const logo = screen.getByAltText('GitHub logo') as HTMLImageElement;
    expect(logo.src).toContain('googleusercontent.com');
    expect(screen.getByText('SECURE')).toBeTruthy();
  });

  it('uses an empty password fallback for strength labeling', () => {
    render(
      <VaultListItem
        item={{ ...vaultItem, password: undefined }}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('WEAK')).toBeTruthy();
  });
});
