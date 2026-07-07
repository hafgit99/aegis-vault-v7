/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Local persistence for the "recent searches" feature.
 *
 * The history is stored in `localStorage` under a single key as a JSON
 * array. We deliberately keep the API in pure, non-React terms so it
 * can be unit-tested without a DOM, and so the storage backend can be
 * swapped in the future (e.g. IndexedDB) without touching callers.
 *
 * Notes:
 *  - We cap the history at `MAX_RECENT_SEARCHES` entries to keep the
 *    UI panel manageable and to bound storage usage.
 *  - Each entry records when it was last used so the UI can show
 *    relative timestamps later if desired.
 *  - All functions are defensive: a corrupt localStorage value must
 *    not crash the search experience.
 */

export interface RecentSearchEntry {
  /** The query the user actually submitted (trimmed, non-empty). */
  query: string;
  /** ISO-8601 timestamp of when the entry was last used. */
  lastUsedAt: string;
}

export const RECENT_SEARCHES_STORAGE_KEY = 'aegis-vault-v7-recent-searches';
export const MAX_RECENT_SEARCHES = 10;

function isStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseEntries(raw: string | null): RecentSearchEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is RecentSearchEntry => {
        return (
          entry !== null &&
          typeof entry === 'object' &&
          typeof entry.query === 'string' &&
          typeof entry.lastUsedAt === 'string' &&
          entry.query.trim().length > 0
        );
      })
      .slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

export function readRecentSearches(): RecentSearchEntry[] {
  if (!isStorageAvailable()) return [];
  try {
    return parseEntries(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeEntries(entries: RecentSearchEntry[]): void {
  if (!isStorageAvailable()) return;
  try {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Ignore quota / privacy-mode errors — the recent searches panel
    // is a nice-to-have and must never break the main search flow.
  }
}

/**
 * Add a query to the history. If the same query (case-insensitive) is
 * already present, it is moved to the top and its timestamp updated.
 */
export function recordRecentSearch(query: string): RecentSearchEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return readRecentSearches();

  const existing = readRecentSearches().filter(
    (entry) => entry.query.toLowerCase() !== trimmed.toLowerCase(),
  );
  const next: RecentSearchEntry[] = [
    { query: trimmed, lastUsedAt: new Date().toISOString() },
    ...existing,
  ].slice(0, MAX_RECENT_SEARCHES);
  writeEntries(next);
  return next;
}

/** Remove a single entry from the history. */
export function removeRecentSearch(query: string): RecentSearchEntry[] {
  const next = readRecentSearches().filter(
    (entry) => entry.query.toLowerCase() !== query.toLowerCase(),
  );
  writeEntries(next);
  return next;
}

/** Wipe the entire history. */
export function clearRecentSearches(): void {
  writeEntries([]);
}
