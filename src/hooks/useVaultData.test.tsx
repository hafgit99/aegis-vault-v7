/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import { getVaultItems, purgeExpiredTrashItems, saveVaultItem, saveVaultItems } from '../lib/storage';
import { useVaultData } from './useVaultData';

vi.mock('../lib/storage', () => ({
  getVaultItems: vi.fn(),
  purgeExpiredTrashItems: vi.fn(),
  saveVaultItem: vi.fn(),
  saveVaultItems: vi.fn(),
}));

const hasActiveMasterPassword = vi.hoisted(() => vi.fn(() => true));

vi.mock('../lib/vaultSession', () => ({
  hasActiveMasterPassword,
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

beforeEach(() => {
  hasActiveMasterPassword.mockReturnValue(true);
  // Y-14: retention is enforced explicitly on refresh, and the purge returns the
  // remaining items. The default mock mirrors that, deriving from `getVaultItems`
  // so per-test item fixtures still drive the assertions.
  vi.mocked(purgeExpiredTrashItems).mockImplementation(
    async () => ({ items: await vi.mocked(getVaultItems)(), purgedCount: 0 }),
  );
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

  // ─── Y-14: retention is enforced explicitly, not by reading ───────────────

  it('Y-14: refresh purges expired trash exactly once, explicitly', async () => {
    vi.mocked(purgeExpiredTrashItems).mockResolvedValue({ items: [item('kept')], purgedCount: 2 });
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    expect(purgeExpiredTrashItems).toHaveBeenCalledTimes(1);
    expect(result.current.items).toEqual([item('kept')]);
  });

  it('Y-14: refresh falls back to a plain read if the purge fails', async () => {
    // A failed purge must not break the vault view.
    vi.mocked(purgeExpiredTrashItems).mockRejectedValue(new Error('purge failed'));
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    expect(result.current.items).toEqual([item('mail')]);
    expect(result.current.selectedItem?.id).toBe('mail');
  });

  it('Y-14: refresh shows trashed items it did not purge', async () => {
    // The read path is pure: an item that has not passed the retention window
    // is still there, and nothing was deleted to produce this list.
    const trashed = item('trashed', { deleted: true, deletedAt: '2026-01-01T00:00:00.000Z' });
    vi.mocked(purgeExpiredTrashItems).mockResolvedValue({ items: [trashed, item('mail')], purgedCount: 0 });
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    expect(result.current.items).toHaveLength(2);
    expect(result.current.selectedItem?.id).toBe('mail');
  });

  // ─── Y-14: a save after auto-lock must not empty the list ────────────────

  it('Y-14: saveItem keeps the list intact when the session is locked', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail'), item('other')]);
    vi.mocked(saveVaultItem).mockResolvedValue([]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    // Auto-lock fires between the render and the write.
    hasActiveMasterPassword.mockReturnValue(false);
    vi.mocked(saveVaultItem).mockResolvedValue([]);

    await act(async () => {
      await result.current.saveItem(item('mail'));
    });

    // `withSessionVaultKey` returns its `[]` fallback when locked, so the old
    // unconditional `setItems(updated)` emptied the list while nothing was
    // written — indistinguishable from "saved, and my vault vanished".
    expect(result.current.items).toHaveLength(2);
  });

  it('Y-14: saveItems keeps the list intact when the session is locked', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    hasActiveMasterPassword.mockReturnValue(false);
    vi.mocked(saveVaultItems).mockResolvedValue([]);

    await act(async () => {
      await result.current.saveItems([item('mail')]);
    });

    expect(result.current.items).toHaveLength(1);
  });

  it('Y-14: toggleFavorite keeps the list intact when the session is locked', async () => {
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    hasActiveMasterPassword.mockReturnValue(false);
    vi.mocked(saveVaultItem).mockResolvedValue([]);

    await act(async () => {
      await result.current.toggleFavorite(item('mail'));
    });

    expect(result.current.items).toHaveLength(1);
  });

  it('Y-14: an empty result from a genuinely open session still clears the list', async () => {
    // Guards against over-correction: with a real session, an empty result is a
    // legitimate state (the last item was removed) and must be applied.
    vi.mocked(getVaultItems).mockResolvedValue([item('mail')]);
    vi.mocked(saveVaultItem).mockResolvedValue([]);
    const { result } = renderHook(() => useVaultData());

    await act(async () => {
      await result.current.refreshDatabase();
    });

    await act(async () => {
      await result.current.saveItem(item('mail'));
    });

    expect(result.current.items).toEqual([]);
  });
});
