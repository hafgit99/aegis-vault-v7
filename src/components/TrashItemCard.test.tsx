// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { VaultItem } from '../types';
import TrashItemCard from './TrashItemCard';

const trashItem: VaultItem = {
  id: 'trash-1',
  title: 'Deleted GitHub',
  username: 'octo@example.com',
  password: 'secret',
  url: 'github.com',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
  category: 'login',
  deleted: true,
  deletedAt: '2026-06-10T12:00:00.000Z',
};

describe('TrashItemCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-12T12:00:00.000Z'));
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
  });

  it('renders trash item details and actions', () => {
    render(<TrashItemCard item={trashItem} onRestore={vi.fn()} onDeletePermanently={vi.fn()} />);

    expect(screen.getByText('Deleted GitHub')).toBeTruthy();
    expect(screen.getByText('octo@example.com')).toBeTruthy();
    expect(screen.getByText(/13/)).toBeTruthy();
    expect(screen.getByText(/Geri/)).toBeTruthy();
  });

  it('falls back when deletion date is missing', () => {
    render(
      <TrashItemCard
        item={{ ...trashItem, deletedAt: undefined }}
        onRestore={vi.fn()}
        onDeletePermanently={vi.fn()}
      />,
    );

    expect(screen.getByText(/15/)).toBeTruthy();
    expect(screen.getByText('Silindi: Bilinmiyor')).toBeTruthy();
  });

  it('calls restore and permanent delete callbacks with the item', () => {
    const onRestore = vi.fn();
    const onDeletePermanently = vi.fn();

    render(<TrashItemCard item={trashItem} onRestore={onRestore} onDeletePermanently={onDeletePermanently} />);

    fireEvent.click(screen.getByTitle('Kasaya Geri Yükle'));
    fireEvent.click(screen.getByTitle('Kalıcı Olarak Sil'));

    expect(onRestore).toHaveBeenCalledWith(trashItem);
    expect(onDeletePermanently).toHaveBeenCalledWith(trashItem);
  });

  it('renders trash item controls in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <TrashItemCard item={trashItem} onRestore={vi.fn()} onDeletePermanently={vi.fn()} />
      </LanguageProvider>,
    );

    expect(screen.getByText('13 Days Left')).toBeTruthy();
    expect(screen.getByText(/Deleted:/)).toBeTruthy();
    expect(screen.getByText('Restore')).toBeTruthy();
    expect(screen.getByTitle('Restore to Vault')).toBeTruthy();
    expect(screen.getByTitle('Delete Permanently')).toBeTruthy();
  });
});
