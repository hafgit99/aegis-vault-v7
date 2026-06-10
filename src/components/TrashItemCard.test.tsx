// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    cleanup();
  });

  it('renders trash item details and actions', () => {
    render(<TrashItemCard item={trashItem} onRestore={vi.fn()} onDeletePermanently={vi.fn()} />);

    expect(screen.getByText('Deleted GitHub')).toBeTruthy();
    expect(screen.getByText('octo@example.com')).toBeTruthy();
    expect(screen.getByText(/Gün Kaldı/)).toBeTruthy();
    expect(screen.getByText('Geri Yükle')).toBeTruthy();
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
});
