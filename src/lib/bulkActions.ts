/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pure helpers for the "bulk actions" feature.
 *
 * The bulk action bar takes a list of selected item ids and a
 * reference to the live items, and returns the patched item list.
 * Keeping the logic pure makes it trivial to unit-test and to
 * reuse it from both the toolbar and any future right-click menu.
 */

import { slugifyTagName } from './tags';
import type { VaultItem } from '../types';

export type BulkActionKind =
  | 'delete'
  | 'restore'
  | 'permanentDelete'
  | 'moveToFolder'
  | 'removeFromFolder'
  | 'addTag'
  | 'removeTag'
  | 'toggleTag'
  | 'favorite'
  | 'unfavorite'
  | 'toggleFavorite';

export interface BulkActionResult {
  items: VaultItem[];
  /** Number of items that were actually changed. */
  affected: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isPicked<T>(set: Set<T>, value: T): boolean {
  return set.has(value);
}

function patchedList(
  items: VaultItem[],
  ids: Set<string>,
  mutator: (item: VaultItem) => VaultItem | null,
): BulkActionResult {
  if (ids.size === 0) return { items, affected: 0 };
  const next: VaultItem[] = [];
  let affected = 0;
  for (const item of items) {
    if (!isPicked(ids, item.id)) {
      next.push(item);
      continue;
    }
    const updated = mutator(item);
    if (updated) {
      next.push(updated);
      affected += 1;
    }
  }
  return { items: next, affected };
}

/* ---------------------------------------------------------------- *
 * Individual actions
 * ---------------------------------------------------------------- */

export function bulkSoftDelete(items: VaultItem[], ids: Set<string>): BulkActionResult {
  return patchedList(items, ids, (item) => ({
    ...item,
    deleted: true,
    deletedAt: nowIso(),
  }));
}

export function bulkRestore(items: VaultItem[], ids: Set<string>): BulkActionResult {
  return patchedList(items, ids, (item) => {
    const { deleted: _deleted, deletedAt: _deletedAt, ...rest } = item;
    return { ...rest } as VaultItem;
  });
}

export function bulkPermanentDelete(items: VaultItem[], ids: Set<string>): BulkActionResult {
  const next = items.filter((item) => !isPicked(ids, item.id));
  return { items: next, affected: items.length - next.length };
}

export function bulkMoveToFolder(
  items: VaultItem[],
  ids: Set<string>,
  folderId: string | null,
): BulkActionResult {
  return patchedList(items, ids, (item) => ({
    ...item,
    folderId: folderId ?? undefined,
    updatedAt: nowIso(),
  }));
}

export function bulkRemoveFromFolder(items: VaultItem[], ids: Set<string>): BulkActionResult {
  return patchedList(items, ids, (item) => {
    const { folderId: _folderId, ...rest } = item;
    return { ...rest, updatedAt: nowIso() } as VaultItem;
  });
}

export function bulkAddTag(
  items: VaultItem[],
  ids: Set<string>,
  tag: string,
): BulkActionResult {
  const trimmed = tag.trim();
  if (!trimmed) return { items, affected: 0 };
  return patchedList(items, ids, (item) => {
    const existing = item.tags ?? [];
    if (existing.some((t) => slugifyTagName(t) === slugifyTagName(trimmed))) {
      return item;
    }
    return { ...item, tags: [...existing, trimmed], updatedAt: nowIso() };
  });
}

export function bulkRemoveTag(
  items: VaultItem[],
  ids: Set<string>,
  tag: string,
): BulkActionResult {
  const needle = slugifyTagName(tag);
  return patchedList(items, ids, (item) => {
    const existing = item.tags ?? [];
    const next = existing.filter((t) => slugifyTagName(t) !== needle);
    if (next.length === existing.length) return item;
    return { ...item, tags: next, updatedAt: nowIso() };
  });
}

export function bulkToggleTag(
  items: VaultItem[],
  ids: Set<string>,
  tag: string,
): BulkActionResult {
  const trimmed = tag.trim();
  if (!trimmed) return { items, affected: 0 };
  const needle = slugifyTagName(trimmed);
  return patchedList(items, ids, (item) => {
    const existing = item.tags ?? [];
    const has = existing.some((t) => slugifyTagName(t) === needle);
    if (has) {
      return {
        ...item,
        tags: existing.filter((t) => slugifyTagName(t) !== needle),
        updatedAt: nowIso(),
      };
    }
    return { ...item, tags: [...existing, trimmed], updatedAt: nowIso() };
  });
}

export function bulkSetFavorite(
  items: VaultItem[],
  ids: Set<string>,
  favorite: boolean,
): BulkActionResult {
  return patchedList(items, ids, (item) =>
    item.favorite === favorite ? item : { ...item, favorite, updatedAt: nowIso() },
  );
}

export function bulkToggleFavorite(items: VaultItem[], ids: Set<string>): BulkActionResult {
  return patchedList(items, ids, (item) => ({
    ...item,
    favorite: !item.favorite,
    updatedAt: nowIso(),
  }));
}

/* ---------------------------------------------------------------- *
 * Dispatcher
 * ---------------------------------------------------------------- */

export interface BulkActionInput {
  kind: BulkActionKind;
  ids: Set<string>;
  tag?: string;
  folderId?: string | null;
  favorite?: boolean;
}

export function applyBulkAction(items: VaultItem[], input: BulkActionInput): BulkActionResult {
  switch (input.kind) {
    case 'delete':
      return bulkSoftDelete(items, input.ids);
    case 'restore':
      return bulkRestore(items, input.ids);
    case 'permanentDelete':
      return bulkPermanentDelete(items, input.ids);
    case 'moveToFolder':
      return bulkMoveToFolder(items, input.ids, input.folderId ?? null);
    case 'removeFromFolder':
      return bulkRemoveFromFolder(items, input.ids);
    case 'addTag':
      return bulkAddTag(items, input.ids, input.tag ?? '');
    case 'removeTag':
      return bulkRemoveTag(items, input.ids, input.tag ?? '');
    case 'toggleTag':
      return bulkToggleTag(items, input.ids, input.tag ?? '');
    case 'favorite':
      return bulkSetFavorite(items, input.ids, true);
    case 'unfavorite':
      return bulkSetFavorite(items, input.ids, false);
    case 'toggleFavorite':
      return bulkToggleFavorite(items, input.ids);
    default:
      return { items, affected: 0 };
  }
}


