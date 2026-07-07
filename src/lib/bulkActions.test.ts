/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { applyBulkAction, bulkSoftDelete, bulkRestore, bulkPermanentDelete } from './bulkActions';
import { VaultItem } from '../types';

const mockItems = (): VaultItem[] => [
  {
    id: '1',
    title: 'Item 1',
    username: 'user1',
    password: 'pw1',
    category: 'login',
    favorite: false,
    url: '',
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  },
  {
    id: '2',
    title: 'Item 2',
    username: 'user2',
    password: 'pw2',
    category: 'login',
    favorite: true,
    tags: ['old-tag'],
    folderId: 'folder-a',
    url: '',
    createdAt: '2026-07-01',
    updatedAt: '2026-07-01',
  },
];

describe('Bulk Actions Library', () => {
  it('soft deletes selected items', () => {
    const res = applyBulkAction(mockItems(), {
      kind: 'delete',
      ids: new Set(['1']),
    });
    expect(res.affected).toBe(1);
    expect(res.items.find(i => i.id === '1')!.deleted).toBe(true);
  });

  it('restores soft-deleted items', () => {
    const initial = mockItems();
    initial[0].deleted = true;
    initial[0].deletedAt = new Date().toISOString();

    const res = applyBulkAction(initial, {
      kind: 'restore',
      ids: new Set(['1']),
    });
    expect(res.affected).toBe(1);
    expect(res.items.find(i => i.id === '1')!.deleted).toBeUndefined();
  });

  it('permanently deletes selected items', () => {
    const res = applyBulkAction(mockItems(), {
      kind: 'permanentDelete',
      ids: new Set(['1']),
    });
    expect(res.affected).toBe(1);
    expect(res.items.length).toBe(1);
    expect(res.items.some(i => i.id === '1')).toBe(false);
  });

  it('moves items to a folder and removes them', () => {
    const resMove = applyBulkAction(mockItems(), {
      kind: 'moveToFolder',
      ids: new Set(['1']),
      folderId: 'folder-new',
    });
    expect(resMove.affected).toBe(1);
    expect(resMove.items.find(i => i.id === '1')!.folderId).toBe('folder-new');

    const resRemove = applyBulkAction(mockItems(), {
      kind: 'removeFromFolder',
      ids: new Set(['2']),
    });
    expect(resRemove.affected).toBe(1);
    expect(resRemove.items.find(i => i.id === '2')!.folderId).toBeUndefined();
  });

  it('adds, removes, and toggles tags on items', () => {
    const resAdd = applyBulkAction(mockItems(), {
      kind: 'addTag',
      ids: new Set(['1']),
      tag: 'new-tag',
    });
    expect(resAdd.items.find(i => i.id === '1')!.tags).toContain('new-tag');

    const resRemove = applyBulkAction(mockItems(), {
      kind: 'removeTag',
      ids: new Set(['2']),
      tag: 'old-tag',
    });
    expect(resRemove.items.find(i => i.id === '2')!.tags?.length).toBe(0);

    const resToggleOff = applyBulkAction(mockItems(), {
      kind: 'toggleTag',
      ids: new Set(['2']),
      tag: 'old-tag',
    });
    expect(resToggleOff.items.find(i => i.id === '2')!.tags?.length).toBe(0);

    const resToggleOn = applyBulkAction(mockItems(), {
      kind: 'toggleTag',
      ids: new Set(['1']),
      tag: 'fresh-tag',
    });
    expect(resToggleOn.items.find(i => i.id === '1')!.tags).toContain('fresh-tag');
  });

  it('sets and toggles favorite status', () => {
    const resFav = applyBulkAction(mockItems(), {
      kind: 'favorite',
      ids: new Set(['1']),
    });
    expect(resFav.items.find(i => i.id === '1')!.favorite).toBe(true);

    const resUnfav = applyBulkAction(mockItems(), {
      kind: 'unfavorite',
      ids: new Set(['2']),
    });
    expect(resUnfav.items.find(i => i.id === '2')!.favorite).toBe(false);

    const resToggle = applyBulkAction(mockItems(), {
      kind: 'toggleFavorite',
      ids: new Set(['1']),
    });
    expect(resToggle.items.find(i => i.id === '1')!.favorite).toBe(true);
  });
});
