/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tag library + colour palette helpers for the 5.3 tagging feature.
 *
 * The library is the single source of truth for the user-defined tag
 * set. Items only store the *name* of a tag on themselves
 * (VaultItem.tags) so the library can rename / recolour tags without
 * having to rewrite every item.
 *
 * Storage is `localStorage` under a single, versioned key. Helpers are
 * defensive: corrupt values are ignored, the app never crashes, and
 * the in-memory state is the canonical truth until the next write.
 */

import type { TagColorKey, TagDefinition } from '../types';

export const TAG_LIBRARY_STORAGE_KEY = 'aegis-vault-v7-tag-library-v1';
export const MAX_TAG_LIBRARY_ENTRIES = 200;

/**
 * Tailwind-friendly palette mapping. We use class-name fragments so
 * callers can compose them with arbitrary sizes / shapes.
 */
export interface TagPalette {
  background: string;
  border: string;
  text: string;
  pill: string;
  inline: string;
}

export const TAG_PALETTE: Record<TagColorKey, TagPalette> = {
  rose: { background: 'bg-rose-500/15', border: 'border-rose-500/40', text: 'text-rose-300', pill: 'bg-rose-500/20 text-rose-100 border-rose-500/30', inline: 'bg-rose-500/10 text-rose-200' },
  pink: { background: 'bg-pink-500/15', border: 'border-pink-500/40', text: 'text-pink-300', pill: 'bg-pink-500/20 text-pink-100 border-pink-500/30', inline: 'bg-pink-500/10 text-pink-200' },
  fuchsia: { background: 'bg-fuchsia-500/15', border: 'border-fuchsia-500/40', text: 'text-fuchsia-300', pill: 'bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-500/30', inline: 'bg-fuchsia-500/10 text-fuchsia-200' },
  purple: { background: 'bg-purple-500/15', border: 'border-purple-500/40', text: 'text-purple-300', pill: 'bg-purple-500/20 text-purple-100 border-purple-500/30', inline: 'bg-purple-500/10 text-purple-200' },
  violet: { background: 'bg-violet-500/15', border: 'border-violet-500/40', text: 'text-violet-300', pill: 'bg-violet-500/20 text-violet-100 border-violet-500/30', inline: 'bg-violet-500/10 text-violet-200' },
  indigo: { background: 'bg-indigo-500/15', border: 'border-indigo-500/40', text: 'text-indigo-300', pill: 'bg-indigo-500/20 text-indigo-100 border-indigo-500/30', inline: 'bg-indigo-500/10 text-indigo-200' },
  blue: { background: 'bg-blue-500/15', border: 'border-blue-500/40', text: 'text-blue-300', pill: 'bg-blue-500/20 text-blue-100 border-blue-500/30', inline: 'bg-blue-500/10 text-blue-200' },
  sky: { background: 'bg-sky-500/15', border: 'border-sky-500/40', text: 'text-sky-300', pill: 'bg-sky-500/20 text-sky-100 border-sky-500/30', inline: 'bg-sky-500/10 text-sky-200' },
  cyan: { background: 'bg-cyan-500/15', border: 'border-cyan-500/40', text: 'text-cyan-300', pill: 'bg-cyan-500/20 text-cyan-100 border-cyan-500/30', inline: 'bg-cyan-500/10 text-cyan-200' },
  teal: { background: 'bg-teal-500/15', border: 'border-teal-500/40', text: 'text-teal-300', pill: 'bg-teal-500/20 text-teal-100 border-teal-500/30', inline: 'bg-teal-500/10 text-teal-200' },
  emerald: { background: 'bg-emerald-500/15', border: 'border-emerald-500/40', text: 'text-emerald-300', pill: 'bg-emerald-500/20 text-emerald-100 border-emerald-500/30', inline: 'bg-emerald-500/10 text-emerald-200' },
  green: { background: 'bg-green-500/15', border: 'border-green-500/40', text: 'text-green-300', pill: 'bg-green-500/20 text-green-100 border-green-500/30', inline: 'bg-green-500/10 text-green-200' },
  lime: { background: 'bg-lime-500/15', border: 'border-lime-500/40', text: 'text-lime-300', pill: 'bg-lime-500/20 text-lime-100 border-lime-500/30', inline: 'bg-lime-500/10 text-lime-200' },
  yellow: { background: 'bg-yellow-500/15', border: 'border-yellow-500/40', text: 'text-yellow-300', pill: 'bg-yellow-500/20 text-yellow-100 border-yellow-500/30', inline: 'bg-yellow-500/10 text-yellow-200' },
  amber: { background: 'bg-amber-500/15', border: 'border-amber-500/40', text: 'text-amber-300', pill: 'bg-amber-500/20 text-amber-100 border-amber-500/30', inline: 'bg-amber-500/10 text-amber-200' },
  orange: { background: 'bg-orange-500/15', border: 'border-orange-500/40', text: 'text-orange-300', pill: 'bg-orange-500/20 text-orange-100 border-orange-500/30', inline: 'bg-orange-500/10 text-orange-200' },
  red: { background: 'bg-red-500/15', border: 'border-red-500/40', text: 'text-red-300', pill: 'bg-red-500/20 text-red-100 border-red-500/30', inline: 'bg-red-500/10 text-red-200' },
  slate: { background: 'bg-slate-500/15', border: 'border-slate-500/40', text: 'text-slate-300', pill: 'bg-slate-500/20 text-slate-100 border-slate-500/30', inline: 'bg-slate-500/10 text-slate-200' },
};

export const TAG_COLOR_KEYS: TagColorKey[] = Object.keys(TAG_PALETTE) as TagColorKey[];

/* ---------------------------------------------------------------- *
 * Persistence
 * ---------------------------------------------------------------- */

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function isValidColor(value: unknown): value is TagColorKey {
  return typeof value === 'string' && (TAG_COLOR_KEYS as string[]).includes(value);
}

function parseEntry(raw: unknown): TagDefinition | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || obj.id.length === 0) return null;
  if (typeof obj.name !== 'string' || obj.name.trim().length === 0) return null;
  if (typeof obj.slug !== 'string' || obj.slug.length === 0) return null;
  if (!isValidColor(obj.color)) return null;
  if (typeof obj.createdAt !== 'string') return null;
  return {
    id: obj.id,
    name: obj.name.trim(),
    slug: obj.slug,
    color: obj.color,
    createdAt: obj.createdAt,
  };
}

function readRaw(): TagDefinition[] {
  if (!isStorageAvailable()) return [];
  try {
    const raw = window.localStorage.getItem(TAG_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: TagDefinition[] = [];
    for (const entry of parsed) {
      const valid = parseEntry(entry);
      if (valid) out.push(valid);
    }
    return out.slice(0, MAX_TAG_LIBRARY_ENTRIES);
  } catch {
    return [];
  }
}

function writeRaw(entries: TagDefinition[]): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(TAG_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota or private-mode errors are non-fatal.
  }
}

/* ---------------------------------------------------------------- *
 * Slug + id helpers
 * ---------------------------------------------------------------- */

/**
 * Slugify a human name into a stable, case-folded identifier that
 * does not depend on locale-specific case mapping.
 */
export function slugifyTagName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

let _counter = 0;
function uniqueId(): string {
  _counter += 1;
  // Time + counter is good enough — these ids are local to the device.
  return `tag-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

/* ---------------------------------------------------------------- *
 * Public API
 * ---------------------------------------------------------------- */

export function readTagLibrary(): TagDefinition[] {
  return readRaw();
}

export function writeTagLibrary(entries: TagDefinition[]): TagDefinition[] {
  const safe = entries.slice(0, MAX_TAG_LIBRARY_ENTRIES);
  writeRaw(safe);
  return safe;
}

export function createTag(input: { name: string; color?: TagColorKey }): TagDefinition | null {
  const name = input.name.trim();
  if (!name) return null;
  const library = readRaw();
  const slug = slugifyTagName(name);
  if (library.some((entry) => entry.slug === slug)) {
    return library.find((entry) => entry.slug === slug) ?? null;
  }
  const entry: TagDefinition = {
    id: uniqueId(),
    name,
    slug,
    color: input.color ?? 'indigo',
    createdAt: new Date().toISOString(),
  };
  writeRaw([...library, entry]);
  return entry;
}

export interface UpdateTagInput {
  name?: string;
  color?: TagColorKey;
}

export function updateTag(
  id: string,
  patch: UpdateTagInput,
): TagDefinition[] {
  const library = readRaw();
  const next = library.map((entry) => {
    if (entry.id !== id) return entry;
    return {
      ...entry,
      name: patch.name?.trim() || entry.name,
      color: patch.color ?? entry.color,
      slug: patch.name ? slugifyTagName(patch.name) : entry.slug,
    };
  });
  writeRaw(next);
  return next;
}

export function deleteTag(id: string): TagDefinition[] {
  const library = readRaw();
  writeRaw(library.filter((entry) => entry.id !== id));
  return library.filter((entry) => entry.id !== id);
}

export function getPalette(color: TagColorKey): TagPalette {
  return TAG_PALETTE[color] ?? TAG_PALETTE.slate;
}

/**
 * Resolve the colour for an item tag. If the user has a definition
 * with a matching slug we return that colour; otherwise we fall back
 * to a deterministic hue from the slug so unlisted tags still get a
 * meaningful colour when rendered.
 */
export function resolveTagColor(tagName: string, library?: TagDefinition[]): TagColorKey {
  const list = library ?? readRaw();
  const slug = slugifyTagName(tagName);
  const exact = list.find((entry) => entry.slug === slug);
  if (exact) return exact.color;

  // Deterministic fallback hash so the same tag name always gets the
  // same colour across renders.
  let hash = 0;
  for (let i = 0; i < slug.length; i += 1) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0;
  }
  return TAG_COLOR_KEYS[hash % TAG_COLOR_KEYS.length] ?? 'slate';
}

/**
 * Sync helper: items may reference tag names that no longer exist in
 * the library. The caller can use this to ensure a definition exists
 * for every tag name on the items — useful for first-run migrations.
 */
export function ensureTagsExist(names: string[]): TagDefinition[] {
  const library = readRaw();
  const bySlug = new Map(library.map((entry) => [entry.slug, entry]));
  const additions: TagDefinition[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const slug = slugifyTagName(trimmed);
    if (bySlug.has(slug)) continue;
    const entry: TagDefinition = {
      id: uniqueId(),
      name: trimmed,
      slug,
      color: resolveTagColor(trimmed, library),
      createdAt: new Date().toISOString(),
    };
    bySlug.set(slug, entry);
    additions.push(entry);
  }
  if (additions.length > 0) {
    const merged = [...library, ...additions].slice(0, MAX_TAG_LIBRARY_ENTRIES);
    writeRaw(merged);
    return merged;
  }
  return library;
}


