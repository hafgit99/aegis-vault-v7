/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { VaultItem } from '../types';
import VaultItemDetailHeader from './VaultItemDetailHeader';

const item: VaultItem = {
  id: 'item-1',
  title: 'Internal Wiki',
  username: 'team@example.com',
  password: 'secret',
  url: 'wiki.example.com',
  notes: 'private note',
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-11T12:00:00.000Z',
  category: 'login',
  favorite: true,
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('VaultItemDetailHeader', () => {
  it('renders item identity and link', () => {
    render(
      <VaultItemDetailHeader
        item={item}
        copiedField={null}
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
        onCopyText={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Internal Wiki')).toBeTruthy();
    expect(screen.getByText('wiki.example.com')).toBeTruthy();
    expect(screen.getByRole('link')).toHaveProperty('href', 'https://wiki.example.com/');
  });

  it('fires favorite, edit, export, and delete actions', () => {
    const onToggleFavorite = vi.fn();
    const onEdit = vi.fn();
    const onCopyText = vi.fn();
    const onDelete = vi.fn();

    render(
      <VaultItemDetailHeader
        item={item}
        copiedField={null}
        onToggleFavorite={onToggleFavorite}
        onEdit={onEdit}
        onCopyText={onCopyText}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(screen.getByTitle('Favorilerden Çıkar'));
    fireEvent.click(screen.getByTitle('Düzenle'));
    fireEvent.click(screen.getByTitle('Paylaş / JSON Kopyala'));
    fireEvent.click(screen.getByTitle('Sil'));

    expect(onToggleFavorite).toHaveBeenCalledWith(item);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onCopyText).toHaveBeenCalledWith(JSON.stringify(item, null, 2), 'item_export');
    expect(onDelete).toHaveBeenCalledWith('item-1');
  });

  it('renders a platform logo when the item matches a known provider', () => {
    render(
      <VaultItemDetailHeader
        item={{ ...item, title: 'GitHub', url: 'github.com' }}
        copiedField={null}
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
        onCopyText={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    const logo = screen.getByAltText('GitHub Logo') as HTMLImageElement;
    expect(logo.src).toContain('googleusercontent.com');
  });

  it('renders action titles in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <VaultItemDetailHeader
          item={{ ...item, favorite: false }}
          copiedField={null}
          onToggleFavorite={vi.fn()}
          onEdit={vi.fn()}
          onCopyText={vi.fn()}
          onDelete={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByTitle('Add to Favorites')).toBeTruthy();
    expect(screen.getByTitle('Edit')).toBeTruthy();
    expect(screen.getByTitle('Share / Copy JSON')).toBeTruthy();
    expect(screen.getByTitle('Delete')).toBeTruthy();
  });

  it('renders the copied export state', () => {
    const { container } = render(
      <VaultItemDetailHeader
        item={item}
        copiedField="item_export"
        onToggleFavorite={vi.fn()}
        onEdit={vi.fn()}
        onCopyText={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(container.querySelector('.text-brand-tertiary')).toBeTruthy();
  });
});
