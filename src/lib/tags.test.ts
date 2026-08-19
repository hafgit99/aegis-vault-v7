/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createTag,
  updateTag,
  deleteTag,
  resolveTagColor,
  ensureTagsExist,
  slugifyTagName,
  getPalette,
  TAG_LIBRARY_STORAGE_KEY,
  writeTagLibrary,
  readTagLibrary,
} from './tags';

describe('Tags Library', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('slugifies names correctly', () => {
    expect(slugifyTagName('Hello World!')).toBe('hello-world');
    expect(slugifyTagName('Şifreler & Dosyalar')).toBe('sifreler-dosyalar');
  });

  it('creates and reads tags', () => {
    const t1 = createTag({ name: 'Work', color: 'rose' });
    expect(t1).not.toBeNull();
    expect(t1!.name).toBe('Work');
    expect(t1!.color).toBe('rose');

    // Create duplicate name should return existing
    const t2 = createTag({ name: 'Work' });
    expect(t2!.id).toBe(t1!.id);
  });

  it('updates tag color and name', () => {
    const t1 = createTag({ name: 'Finance', color: 'blue' })!;
    const updated = updateTag(t1.id, { name: 'New Finance', color: 'green' });
    const target = updated.find(t => t.id === t1.id);
    expect(target!.name).toBe('New Finance');
    expect(target!.color).toBe('green');
  });

  it('deletes tags', () => {
    const t1 = createTag({ name: 'Social' })!;
    const afterDelete = deleteTag(t1.id);
    expect(afterDelete.some(t => t.id === t1.id)).toBe(false);
  });

  it('resolves tag colors from library or deterministically fallback', () => {
    createTag({ name: 'Social', color: 'cyan' })!;
    expect(resolveTagColor('Social')).toBe('cyan');

    // fallback
    const fallbackColor = resolveTagColor('NonExistentTag');
    expect(fallbackColor).toBeDefined();
  });

  it('ensures list of tags exist in the library', () => {
    const list = ensureTagsExist(['TagA', 'TagB', 'Social']);
    expect(list.some(t => t.slug === 'taga')).toBe(true);
    expect(list.some(t => t.slug === 'tagb')).toBe(true);
  });

  it('gets palette style mappings', () => {
    const palette = getPalette('rose');
    expect(palette.background).toContain('bg-rose-500');
  });

  it('covers remaining branches', () => {
    const initial = ensureTagsExist(['Social', '   ']);
    const second = ensureTagsExist(['Social']);
    expect(second.length).toBe(initial.length);

    const written = writeTagLibrary(initial);
    expect(written).toEqual(initial);

    // Update with color only, leaving name unchanged
    const t = initial[0]!;
    const updated = updateTag(t.id, { color: 'amber' });
    expect(updated.find(x => x.id === t.id)?.color).toBe('amber');

    // Resolve color with explicit custom library
    expect(resolveTagColor('Custom', [{ id: '1', name: 'Custom', slug: 'custom', color: 'purple', createdAt: '' }])).toBe('purple');

    localStorage.setItem(TAG_LIBRARY_STORAGE_KEY, 'invalid-json-{');
    const list = readTagLibrary();
    expect(list).toEqual([]);
  });
});
