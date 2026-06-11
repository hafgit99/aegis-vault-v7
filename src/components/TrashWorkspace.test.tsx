/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { VaultItem } from '../types';
import TrashWorkspace from './TrashWorkspace';

const trashItem: VaultItem = {
  id: 'trash-1',
  title: 'Deleted GitHub',
  username: 'octo@example.com',
  password: 'secret',
  url: 'github.com',
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-02T12:00:00.000Z',
  category: 'login',
  deleted: true,
  deletedAt: '2026-06-10T12:00:00.000Z',
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('TrashWorkspace', () => {
  it('renders the empty trash state without the empty action', () => {
    render(
      <TrashWorkspace
        items={[]}
        onEmptyTrash={vi.fn()}
        onRestore={vi.fn()}
        onDeletePermanently={vi.fn()}
      />,
    );

    expect(screen.getByText('Çöp Kutusu (Trash Bin)')).toBeTruthy();
    expect(screen.getByText('Çöp Kutusu Boş')).toBeTruthy();
    expect(screen.queryByText('Çöp Kutusunu Tamamen Boşalt')).toBeNull();
  });

  it('renders trash items and forwards actions', () => {
    const onEmptyTrash = vi.fn();
    const onRestore = vi.fn();
    const onDeletePermanently = vi.fn();

    render(
      <TrashWorkspace
        items={[trashItem]}
        onEmptyTrash={onEmptyTrash}
        onRestore={onRestore}
        onDeletePermanently={onDeletePermanently}
      />,
    );

    expect(screen.getByText('Deleted GitHub')).toBeTruthy();
    expect(screen.getByText('octo@example.com')).toBeTruthy();

    fireEvent.click(screen.getByText('Çöp Kutusunu Tamamen Boşalt'));
    fireEvent.click(screen.getByTitle('Kasaya Geri Yükle'));
    fireEvent.click(screen.getByTitle('Kalıcı Olarak Sil'));

    expect(onEmptyTrash).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith(trashItem);
    expect(onDeletePermanently).toHaveBeenCalledWith(trashItem);
  });

  it('renders trash workspace labels in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <TrashWorkspace
          items={[trashItem]}
          onEmptyTrash={vi.fn()}
          onRestore={vi.fn()}
          onDeletePermanently={vi.fn()}
        />
      </LanguageProvider>,
    );

    expect(screen.getByText('Trash Bin')).toBeTruthy();
    expect(screen.getByText(/Deleted password cards are stored here/i)).toBeTruthy();
    expect(screen.getByText('Empty Trash Completely')).toBeTruthy();
    expect(screen.getByText('Security and Data Protection Notice')).toBeTruthy();
  });
});
