/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import type { VaultItem } from '../types';
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
  window.localStorage.clear();
});

describe('VaultListItem', () => {
  it('renders vault item identity and password strength', () => {
    render(<VaultListItem item={vaultItem} isSelected={false} onSelect={vi.fn()} />);

    expect(screen.getByText('Internal Wiki')).toBeTruthy();
    expect(screen.getByText('team@example.com')).toBeTruthy();
    expect(screen.getByText('I')).toBeTruthy();
    expect(screen.getByText('ZAYIF')).toBeTruthy();
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
    expect(logo.src).toContain('data:image/svg+xml;base64,');
    expect(screen.getByText('GÜVENLİ')).toBeTruthy();
  });

  it('uses an empty password fallback for strength labeling', () => {
    render(
      <VaultListItem
        item={{ ...vaultItem, password: undefined }}
        isSelected={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText('ZAYIF')).toBeTruthy();
  });

  it('renders an Autofill recommendation badge when requested', () => {
    render(
      <VaultListItem
        item={vaultItem}
        isSelected={false}
        onSelect={vi.fn()}
        autofillRecommended
      />,
    );

    expect(screen.getByTestId('autofill-recommended-badge')).toBeTruthy();
    expect(screen.getByText('Önerilen')).toBeTruthy();
  });

  it('renders password strength in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'zh');

    render(
      <LanguageProvider>
        <VaultListItem
          item={{ ...vaultItem, password: 'StrongPassphrase123!' }}
          isSelected={false}
          onSelect={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('安全')).toBeTruthy();
  });

  it('handles drag start and drag end events', () => {
    render(<VaultListItem item={vaultItem} isSelected={false} onSelect={vi.fn()} />);

    const element = screen.getByTestId('vault-list-item');
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };

    fireEvent.dragStart(element, { dataTransfer });
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'item-1');

    fireEvent.dragEnd(element);
  });

  it('renders compact mode and search highlighting with tags', () => {
    const taggedItem: VaultItem = {
      ...vaultItem,
      tags: ['Work', 'Finance'],
      category: 'card',
      cardNumber: '4111222233334444',
    };

    render(
      <VaultListItem
        item={taggedItem}
        isSelected={false}
        onSelect={vi.fn()}
        density="compact"
        match={{ score: 100, matchStart: 9, matchEnd: 13, matchedField: 'title' }}
      />,
    );

    expect(screen.getByTestId('vault-list-item')).toBeTruthy();
  });

  it('renders username highlight when match is on username', () => {
    render(
      <VaultListItem
        item={vaultItem}
        isSelected={false}
        onSelect={vi.fn()}
        match={{ score: 100, matchStart: 0, matchEnd: 4, matchedField: 'username' }}
      />,
    );

    expect(screen.getByTestId('vault-list-item')).toBeTruthy();
  });
});
