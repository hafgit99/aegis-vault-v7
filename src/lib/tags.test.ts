/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
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
import type { TagColorKey, TagDefinition } from '../types';

function makeEntries(count: number, prefix: string, color: TagColorKey = 'rose'): TagDefinition[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}-${i}`,
    name: `${prefix} ${i}`,
    slug: `${prefix.toLowerCase()}-${i}`,
    color,
    createdAt: '',
  }));
}

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

  it('slug edge cases: separators are trimmed and output is capped at 64 chars', () => {
    expect(slugifyTagName('--Hello--World--')).toBe('hello-world');
    expect(slugifyTagName('a'.repeat(100))).toHaveLength(64);
    expect(slugifyTagName('   ')).toBe('');
  });

  it('generates unique ids for tags created in the same millisecond', () => {
    const a = createTag({ name: 'Alpha' })!;
    const b = createTag({ name: 'Zebra Run' })!;
    expect(a.id).not.toBe(b.id);
  });

  it('defaults the colour to indigo when none is provided', () => {
    const t = createTag({ name: 'NoColor' })!;
    expect(t.color).toBe('indigo');
  });

  it('rejects blank tag names on creation', () => {
    expect(createTag({ name: '   ' })).toBeNull();
  });

  it('drops malformed library entries when reading', () => {
    const entries = [
      null,
      'not-an-object',
      { id: '', name: 'X', slug: 'x', color: 'rose', createdAt: '' },
      { id: '2', name: '   ', slug: 'x', color: 'rose', createdAt: '' },
      { id: '3', name: 'X', slug: '', color: 'rose', createdAt: '' },
      { id: '4', name: 'X', slug: 'x', color: 'not-a-color', createdAt: '' },
      { id: '5', name: 'X', slug: 'x', color: 'rose' },
      { id: '6', name: '  Trimmed Name  ', slug: 'trimmed-name', color: 'teal', createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    localStorage.setItem(TAG_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
    const list = readTagLibrary();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('Trimmed Name');
  });

  it('rejects non-array JSON payloads stored under the tag key', () => {
    localStorage.setItem(TAG_LIBRARY_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(readTagLibrary()).toEqual([]);
  });

  it('caps reads at MAX_TAG_LIBRARY_ENTRIES entries', () => {
    localStorage.setItem(TAG_LIBRARY_STORAGE_KEY, JSON.stringify(makeEntries(205, 'id')));
    expect(readTagLibrary()).toHaveLength(200);
  });

  it('caps writes at MAX_TAG_LIBRARY_ENTRIES entries', () => {
    const written = writeTagLibrary(makeEntries(230, 'cap'));
    expect(written).toHaveLength(200);
    expect(readTagLibrary()).toHaveLength(200);
  });

  it('updates only the targeted entry and trims patched names', () => {
    const a = createTag({ name: 'Alpha', color: 'rose' })!;
    const b = createTag({ name: 'Beta', color: 'cyan' })!;
    const next = updateTag(a.id, { name: '  Alpha Renamed  ' });
    const target = next.find((t) => t.id === a.id)!;
    expect(target.name).toBe('Alpha Renamed');
    expect(target.slug).toBe('alpha-renamed');
    // The untouched sibling keeps its identity and slug.
    const sibling = next.find((t) => t.id === b.id)!;
    expect(sibling.name).toBe('Beta');
    expect(sibling.slug).toBe('beta');
  });

  it('keeps the slug when only the colour is patched', () => {
    const t = createTag({ name: 'Keeper', color: 'rose' })!;
    const next = updateTag(t.id, { color: 'amber' });
    const target = next.find((x) => x.id === t.id)!;
    expect(target.slug).toBe('keeper');
    expect(target.name).toBe('Keeper');
    expect(target.color).toBe('amber');
  });

  it('deletes only the targeted entry from a multi-entry library', () => {
    const a = createTag({ name: 'One' })!;
    const b = createTag({ name: 'Two' })!;
    const c = createTag({ name: 'Three' })!;
    const next = deleteTag(b.id);
    expect(next.map((t) => t.id)).toEqual([a.id, c.id]);
  });

  it('falls back to a deterministic palette hue per slug', () => {
    expect(resolveTagColor('NonExistentTag')).toBe('orange');
    expect(resolveTagColor('Alpha')).toBe('fuchsia');
    expect(resolveTagColor('Zebra Run')).toBe('lime');
    // Same input always maps to the same hue.
    expect(resolveTagColor('NonExistentTag')).toBe(resolveTagColor('NonExistentTag'));
  });

  it('returns the slate palette for unknown colours', () => {
    const palette = getPalette('not-a-color' as never);
    expect(palette.background).toContain('bg-slate-500');
  });

  it('caps merged ensureTagsExist results at MAX_TAG_LIBRARY_ENTRIES', () => {
    writeTagLibrary(makeEntries(198, 'seed'));
    const merged = ensureTagsExist(['Fresh A', 'Fresh B', 'Fresh C']);
    // Existing entries win the cap: only the first additions fit.
    expect(merged).toHaveLength(200);
    expect(merged.some((t) => t.slug === 'fresh-a')).toBe(true);
    expect(merged.some((t) => t.slug === 'fresh-b')).toBe(true);
    expect(merged.some((t) => t.slug === 'fresh-c')).toBe(false);
    expect(readTagLibrary()).toHaveLength(200);
  });

  it('degrades gracefully when window/localStorage is unavailable', () => {
    vi.stubGlobal('window', undefined);
    try {
      expect(readTagLibrary()).toEqual([]);
      expect(() => writeTagLibrary([])).not.toThrow();
      // Creation still succeeds in memory; persistence is a silent no-op.
      expect(createTag({ name: 'Offline' })?.slug).toBe('offline');
      expect(updateTag('any-id', { color: 'rose' })).toEqual([]);
      expect(deleteTag('any-id')).toEqual([]);
      expect(resolveTagColor('Offline', [])).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
