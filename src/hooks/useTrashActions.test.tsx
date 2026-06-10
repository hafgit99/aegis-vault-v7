/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VaultItem } from '../types';
import { deletePermanently, emptyTrashComplete, moveToTrash, restoreFromTrash } from '../lib/storage';
import { useTrashActions } from './useTrashActions';

vi.mock('../lib/storage', () => ({
  moveToTrash: vi.fn(),
  emptyTrashComplete: vi.fn(),
  restoreFromTrash: vi.fn(),
  deletePermanently: vi.fn(),
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

function renderTrashActions() {
  const options = {
    openConfirm: vi.fn(),
    setItems: vi.fn(),
    setSelectedItem: vi.fn(),
    resetReveals: vi.fn(),
    clearCopiedField: vi.fn(),
  };

  const hook = renderHook(() => useTrashActions(options));

  return {
    ...hook,
    options,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useTrashActions', () => {
  it('opens a move-to-trash confirmation and updates active selection on confirm', async () => {
    const active = item('active');
    const deleted = item('deleted', { deleted: true });
    vi.mocked(moveToTrash).mockResolvedValue([deleted, active]);
    const { result, options } = renderTrashActions();

    act(() => result.current.deleteItem('deleted'));
    const confirm = options.openConfirm.mock.calls[0][0];
    await act(async () => {
      confirm.onConfirm();
    });

    expect(confirm).toMatchObject({
      title: 'Çöp Kutusuna Taşı',
      type: 'warning',
      confirmText: 'Çöpe Taşı',
    });
    expect(moveToTrash).toHaveBeenCalledWith('deleted');
    expect(options.setItems).toHaveBeenCalledWith([deleted, active]);
    expect(options.resetReveals).toHaveBeenCalledTimes(1);
    expect(options.clearCopiedField).toHaveBeenCalledTimes(1);
    expect(options.setSelectedItem).toHaveBeenCalledWith(active);
  });

  it('clears selection when moving the last active item to trash', async () => {
    const deleted = item('deleted', { deleted: true });
    vi.mocked(moveToTrash).mockResolvedValue([deleted]);
    const { result, options } = renderTrashActions();

    act(() => result.current.deleteItem('deleted'));
    await act(async () => {
      options.openConfirm.mock.calls[0][0].onConfirm();
    });

    expect(options.setSelectedItem).toHaveBeenCalledWith(null);
  });

  it('opens empty-trash confirmation and follows with a success alert', async () => {
    vi.mocked(emptyTrashComplete).mockResolvedValue([]);
    const { result, options } = renderTrashActions();

    act(() => result.current.emptyTrash());
    const confirm = options.openConfirm.mock.calls[0][0];
    await act(async () => {
      confirm.onConfirm();
    });

    expect(confirm).toMatchObject({
      title: 'Çöp Kutusunu Boşalt',
      type: 'danger',
    });
    expect(emptyTrashComplete).toHaveBeenCalledTimes(1);
    expect(options.setItems).toHaveBeenCalledWith([]);
    expect(options.openConfirm.mock.calls[1][0]).toMatchObject({
      title: 'Çöp Kutusu Boşaltıldı',
      type: 'success',
      isAlert: true,
    });
  });

  it('restores a trash item immediately and shows success', async () => {
    const restored = item('restored');
    vi.mocked(restoreFromTrash).mockResolvedValue([restored]);
    const { result, options } = renderTrashActions();

    await act(async () => {
      result.current.restoreTrashItem(item('restored'));
    });

    expect(restoreFromTrash).toHaveBeenCalledWith('restored');
    expect(options.setItems).toHaveBeenCalledWith([restored]);
    expect(options.openConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Geri Yüklendi',
        type: 'success',
        isAlert: true,
      }),
    );
  });

  it('opens permanent delete confirmation and deletes on confirm', async () => {
    vi.mocked(deletePermanently).mockResolvedValue([]);
    const { result, options } = renderTrashActions();

    act(() => result.current.deleteTrashItemPermanently(item('gone')));
    const confirm = options.openConfirm.mock.calls[0][0];
    await act(async () => {
      confirm.onConfirm();
    });

    expect(confirm).toMatchObject({
      title: 'Kalıcı Olarak Sil',
      type: 'danger',
      confirmText: 'Kalıcı Olarak Sil',
    });
    expect(deletePermanently).toHaveBeenCalledWith('gone');
    expect(options.setItems).toHaveBeenCalledWith([]);
  });
});
