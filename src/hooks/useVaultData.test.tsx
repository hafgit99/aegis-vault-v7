/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import { getVaultItems, saveVaultItem } from '../lib/storage';
import { useVaultData } from './useVaultData';

vi.mock('../lib/storage', () => ({
  getVaultItems: vi.fn(),
  saveVaultItem: vi.fn(),
}));

const item = (id: string, overrides: Partial<VaultItem> = {}): VaultItem => ({
  id,
  title: id,
  username: `${id}@example.com`,
  password: `${id}-secret`,
  url: `https://${id}.example.com`,
  createdAt: '2026-06-10T12:00:00.000Z',
  updatedAt: '2026-06-10T12:00:00.000Z',
  category: 'login',
  ...overrides,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useVaultData', () => {
  it('refreshes items and selects the first active item', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('trash', { deleted: true }), item('mail')]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.selectedItem?.id).toBe('mail');
  });

  it('preserves the selected item when it still exists', async () => {
    const selected = item('github');
    vi.mocked(getVaultItems).mockResolvedValue([item('mail'), selected]);
    const { result, rerender } = renderHook(() => useVaultData());

    act(() => result.current.setSelectedItem(selected));
    rerender();
    await act(async () => {
      await result.current.refreshDatabase();
    });

    expect(result.current.selectedItem?.id).toBe('github');
  });

  it('clears selection when no active items remain', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('trash', { deleted: true })]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    expect(result.current.selectedItem).toBeNull();
  });

  it('saves an item and selects the saved entry', async () => {
    const saved = item('mail', { title: 'Mail', username: 'user@example.com' });
    vi.mocked(saveVaultItem).mockResolvedValue([saved]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.saveItem({ ...saved, id: 'draft' });
    });

    expect(saveVaultItem).toHaveBeenCalledWith(expect.objectContaining({ title: 'Mail' }));
    expect(result.current.items).toEqual([saved]);
    expect(result.current.selectedItem).toEqual(saved);
  });

  it('toggles favorite state and selects the persisted updated item', async () => {
    const entry = item('mail', { favorite: false, updatedAt: '2026-06-10T12:00:00.000Z' });
    const updated = item('mail', { favorite: true, updatedAt: '2026-06-26T12:00:00.000Z' });
    vi.mocked(saveVaultItem).mockResolvedValue([updated]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.toggleFavorite(entry);
    });

    expect(saveVaultItem).toHaveBeenCalledWith(expect.objectContaining({ favorite: true }));
    expect(result.current.items).toEqual([updated]);
    expect(result.current.selectedItem).toEqual(updated);
  });

  it('falls back to the optimistic favorite item if the saved response omits it', async () => {
    const entry = item('mail', { favorite: false });
    const other = item('other', { favorite: false });
    vi.mocked(saveVaultItem).mockResolvedValue([other]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.toggleFavorite(entry);
    });

    expect(result.current.items).toEqual([other]);
    expect(result.current.selectedItem).toEqual(expect.objectContaining({ id: 'mail', favorite: true }));
  });

  it('renders large vault datasets progressively while preserving the first active selection', async () => {
    const largeDataset = Array.from({ length: 125 }, (_, index) => item(`item-${index.toString().padStart(3, '0')}`));
    vi.mocked(getVaultItems).mockResolvedValue(largeDataset);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    expect(result.current.items).toHaveLength(125);
    expect(result.current.selectedItem?.id).toBe('item-000');
  });
});
