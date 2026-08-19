/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import type { VaultItem } from '../types';
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

function renderTrashActions(language?: 'en' | 'zh') {
  if (language) {
    localStorage.setItem(languageStorageKey, language);
  }

  const options = {
    openConfirm: vi.fn(),
    setItems: vi.fn(),
    setSelectedItem: vi.fn(),
    resetReveals: vi.fn(),
    clearCopiedField: vi.fn(),
  };

  const hook = renderHook(() => useTrashActions(options), {
    wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>,
  });

  return {
    ...hook,
    options,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

describe('useTrashActions', () => {
  it('opens a move-to-trash confirmation and updates active selection on confirm', async () => {
    const active = item('active');
    const deleted = item('deleted', { deleted: true });
    vi.mocked(moveToTrash).mockResolvedValue([deleted, active]);
    const { result, options } = renderTrashActions();

    act(() => result.current.deleteItem('deleted'));
    const confirm = options.openConfirm.mock.calls[0]![0];
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
      options.openConfirm.mock.calls[0]![0].onConfirm();
    });

    expect(options.setSelectedItem).toHaveBeenCalledWith(null);
  });

  it('opens empty-trash confirmation and follows with a success alert', async () => {
    vi.mocked(emptyTrashComplete).mockResolvedValue([]);
    const { result, options } = renderTrashActions();

    act(() => result.current.emptyTrash());
    const confirm = options.openConfirm.mock.calls[0]![0];
    await act(async () => {
      confirm.onConfirm();
    });

    expect(confirm).toMatchObject({
      title: 'Çöp Kutusunu Boşalt',
      type: 'danger',
    });
    expect(emptyTrashComplete).toHaveBeenCalledTimes(1);
    expect(options.setItems).toHaveBeenCalledWith([]);
    expect(options.openConfirm.mock.calls[1]![0]).toMatchObject({
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
    const confirm = options.openConfirm.mock.calls[0]![0];
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

  it('renders trash confirmations and alerts in the selected language', async () => {
    vi.mocked(emptyTrashComplete).mockResolvedValue([]);
    vi.mocked(restoreFromTrash).mockResolvedValue([item('restored')]);
    const { result, options } = renderTrashActions('en');

    act(() => result.current.deleteItem('active'));
    expect(options.openConfirm.mock.calls[0]![0]).toMatchObject({
      title: 'Move to Trash',
      message: 'Are you sure you want to move this password record to the trash? Items in the trash are cleaned automatically after 15 days.',
      confirmText: 'Move to Trash',
      cancelText: 'Cancel',
    });

    act(() => result.current.emptyTrash());
    const emptyConfirm = options.openConfirm.mock.calls[1]![0];
    await act(async () => {
      emptyConfirm.onConfirm();
    });

    expect(emptyConfirm).toMatchObject({
      title: 'Empty Trash',
      message: 'Are you sure you want to permanently delete ALL passwords in the trash? This action cannot be undone.',
      confirmText: 'Reset and Delete Permanently',
      cancelText: 'Cancel',
    });
    expect(options.openConfirm.mock.calls[2]![0]).toMatchObject({
      title: 'Trash Emptied',
      message: 'All passwords in the trash were permanently deleted.',
      type: 'success',
      isAlert: true,
    });

    await act(async () => {
      result.current.restoreTrashItem(item('restored'));
    });
    expect(options.openConfirm.mock.calls[3]![0]).toMatchObject({
      title: 'Restored',
      message: '"restored" password record was restored to the vault successfully!',
    });

    act(() => result.current.deleteTrashItemPermanently(item('gone')));
    expect(options.openConfirm.mock.calls[4]![0]).toMatchObject({
      title: 'Delete Permanently',
      message: '"gone" will be permanently deleted. This action CANNOT be undone.',
      confirmText: 'Delete Permanently',
      cancelText: 'Cancel',
    });
  });
});
