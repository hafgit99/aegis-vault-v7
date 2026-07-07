/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, beforeEach } from 'vitest';
import {
  useTagLibrary,
  useVaultFolders,
  useSmartFolders,
  useBulkSelection,
} from './useOrganisation';
import { VaultItem } from '../types';

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
      expect(result.current.tags[0].name).toBe('Work');

      const tagId = result.current.tags[0].id;
      act(() => {
        result.current.updateTag(tagId, { name: 'Finance', color: 'blue' });
      });

      expect(result.current.tags[0].name).toBe('Finance');
      expect(result.current.tags[0].color).toBe('blue');

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
      expect(result.current.folders[0].name).toBe('Folder 1');

      const folderId = result.current.folders[0].id;
      act(() => {
        result.current.updateFolder(folderId, { name: 'Folder 1 Renamed' });
      });
      expect(result.current.folders[0].name).toBe('Folder 1 Renamed');

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

  describe('useBulkSelection', () => {
    it('manages checkboxes and ranges selection mode', () => {
      const { result } = renderHook(() => useBulkSelection());

      expect(result.current.isSelectionMode).toBe(false);

      act(() => {
        result.current.enterSelectionMode('id1');
      });

      expect(result.current.isSelectionMode).toBe(true);
      expect(result.current.selectionCount).toBe(1);
      expect(result.current.isSelected('id1')).toBe(true);

      act(() => {
        result.current.toggle('id2');
      });
      expect(result.current.selectionCount).toBe(2);
      expect(result.current.isSelected('id2')).toBe(true);

      act(() => {
        result.current.selectRange(['id1', 'id2', 'id3'], 'id1', 'id3');
      });
      // Range id1 to id3 select all three
      expect(result.current.selectionCount).toBe(3);

      act(() => {
        result.current.clear();
      });
      expect(result.current.selectionCount).toBe(0);
      expect(result.current.isSelectionMode).toBe(false);
    });
  });
});
