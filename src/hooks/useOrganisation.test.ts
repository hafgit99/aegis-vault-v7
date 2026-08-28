// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import {
  useBulkActionRunner,
  useBulkSelection,
  useSmartFolders,
  useTagLibrary,
  useVaultFolders,
} from './useOrganisation';

const item = (id: string, overrides: Partial<VaultItem> = {}): VaultItem => ({
  id,
  title: id,
  username: '',
  password: '',
  url: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  category: 'login',
  ...overrides,
});

describe('useOrganisation Hooks', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('useTagLibrary', () => {
    it('creates, updates and deletes tags via hook state', () => {
      const { result } = renderHook(() => useTagLibrary());

      act(() => {
        result.current.createTag({ name: 'Work', color: 'rose' });
      });

      expect(result.current.tags.length).toBe(1);
      expect(result.current.tags[0]!.name).toBe('Work');

      const tagId = result.current.tags[0]!.id;
      act(() => {
        result.current.updateTag(tagId, { name: 'Finance', color: 'blue' });
      });

      expect(result.current.tags[0]!.name).toBe('Finance');
      expect(result.current.tags[0]!.color).toBe('blue');

      act(() => {
        result.current.deleteTag(tagId);
      });

      expect(result.current.tags.length).toBe(0);
    });
  });

  describe('useVaultFolders', () => {
    it('manages folders state and depth', () => {
      const { result } = renderHook(() => useVaultFolders());

      act(() => {
        result.current.createFolder({ name: 'Folder 1', parentId: null });
      });

      expect(result.current.folders.length).toBe(1);
      expect(result.current.folders[0]!.name).toBe('Folder 1');

      const folderId = result.current.folders[0]!.id;
      act(() => {
        result.current.updateFolder(folderId, { name: 'Folder 1 Renamed' });
      });
      expect(result.current.folders[0]!.name).toBe('Folder 1 Renamed');

      act(() => {
        result.current.deleteFolder(folderId);
      });
      expect(result.current.folders.length).toBe(0);
    });
  });

  describe('useSmartFolders', () => {
    it('computes smart folder counts dynamically', () => {
      const items: VaultItem[] = [
        {
          id: '1',
          title: 'Item 1',
          username: 'user1',
          password: 'password123',
          category: 'login',
          favorite: true,
          url: '',
          createdAt: '2026-07-01',
          updatedAt: '2026-07-01',
        },
      ];

      const { result } = renderHook(() => useSmartFolders(items));

      // Built-in Favorites smart folder should count 1 item
      expect(result.current.counts['smart-favorites']).toBe(1);
      expect(result.current.counts['smart-2fa']).toBe(0);
    });
  });
});

describe('useBulkSelection', () => {
  it('starts empty and outside selection mode', () => {
    const { result } = renderHook(() => useBulkSelection());

    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectionCount).toBe(0);
    expect(result.current.isSelected('a')).toBe(false);
  });

  it('toggles ids in and out of the selection set', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));

    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.selectionCount).toBe(2);

    act(() => result.current.toggle('a'));
    expect(result.current.isSelected('a')).toBe(false);
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.selectionCount).toBe(1);
  });

  it('enters selection mode via selectOnly and remembers only that id', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.toggle('old'));
    act(() => result.current.selectOnly('new'));

    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.isSelected('new')).toBe(true);
    expect(result.current.isSelected('old')).toBe(false);
    expect(result.current.selectionCount).toBe(1);
  });

  it('selects a full list with selectAll', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.selectAll(['a', 'b', 'c']));

    expect(result.current.selectionCount).toBe(3);
    expect(result.current.isSelected('c')).toBe(true);
  });

  it('clears the selection and exits selection mode', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.selectOnly('a'));
    act(() => result.current.clear());

    expect(result.current.selectionCount).toBe(0);
    expect(result.current.isSelectionMode).toBe(false);
  });

  it('enters selection mode without selecting anything when no initial id is given', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.enterSelectionMode());

    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.selectionCount).toBe(0);
  });

  it('enters selection mode and selects the initial id when provided', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.enterSelectionMode('z'));

    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.isSelected('z')).toBe(true);
  });

  it('exits selection mode and drops every selection', () => {
    const { result } = renderHook(() => useBulkSelection());

    act(() => result.current.selectOnly('a'));
    act(() => result.current.exitSelectionMode());

    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectionCount).toBe(0);
  });

  it('selects a forward range between two ids', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c', 'd'];

    act(() => result.current.selectRange(ids, 'a', 'c'));

    expect(result.current.isSelected('a')).toBe(true);
    expect(result.current.isSelected('b')).toBe(true);
    expect(result.current.isSelected('c')).toBe(true);
    expect(result.current.isSelected('d')).toBe(false);
  });

  it('selects a reversed range between two ids', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c', 'd'];

    act(() => result.current.selectRange(ids, 'c', 'a'));

    expect([...result.current.selectedIds].sort()).toEqual(['a', 'b', 'c']);
  });

  it('ignores ranges where either endpoint is missing', () => {
    const { result } = renderHook(() => useBulkSelection());
    const ids = ['a', 'b', 'c', 'd'];

    act(() => result.current.selectRange(ids, 'x', 'b'));
    expect(result.current.selectionCount).toBe(0);

    act(() => result.current.selectRange(ids, 'b', 'x'));
    expect(result.current.selectionCount).toBe(0);
  });
});

describe('useBulkActionRunner', () => {
  it('forwards the patched list when items were affected', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useBulkActionRunner([item('a'), item('b')], onChange),
    );

    act(() => {
      result.current({ kind: 'delete', ids: new Set(['a']) });
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    const patched = onChange.mock.calls[0]![0] as VaultItem[];
    expect(patched).toHaveLength(2);
    expect(patched[0]!.deleted).toBe(true);
  });

  it('skips the callback when nothing was affected', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useBulkActionRunner([item('a')], onChange),
    );

    act(() => {
      result.current({ kind: 'delete', ids: new Set(['missing']) });
    });

    expect(onChange).not.toHaveBeenCalled();
  });
});