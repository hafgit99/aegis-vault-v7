/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearRecentSearches,
  MAX_RECENT_SEARCHES,
  readRecentSearches,
  RECENT_SEARCHES_STORAGE_KEY,
  recordRecentSearch,
  removeRecentSearch,
} from './recentSearches';

afterEach(() => {
  window.localStorage.clear();
});

describe('recentSearches', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('returns an empty list when nothing is stored', () => {
    expect(readRecentSearches()).toEqual([]);
  });

  it('records a new search and returns the updated list', () => {
    const result = recordRecentSearch('github');
    expect(result).toHaveLength(1);
    expect(result[0]!.query).toBe('github');
    expect(readRecentSearches()).toEqual(result);
  });

  it('moves an existing query to the top of the list', () => {
    recordRecentSearch('github');
    recordRecentSearch('gmail');
    const result = recordRecentSearch('github');
    expect(result.map((entry) => entry.query)).toEqual(['github', 'gmail']);
  });

  it('ignores empty queries', () => {
    expect(recordRecentSearch('   ')).toEqual([]);
  });

  it('caps the history at MAX_RECENT_SEARCHES entries', () => {
    for (let i = 0; i < MAX_RECENT_SEARCHES + 5; i += 1) {
      recordRecentSearch(`query-${i}`);
    }
    const stored = readRecentSearches();
    expect(stored).toHaveLength(MAX_RECENT_SEARCHES);
    // Most recent first.
    expect(stored[0]!.query).toBe(`query-${MAX_RECENT_SEARCHES + 4}`);
  });

  it('removes a single entry by query', () => {
    recordRecentSearch('github');
    recordRecentSearch('gmail');
    const result = removeRecentSearch('github');
    expect(result.map((entry) => entry.query)).toEqual(['gmail']);
  });

  it('clears the entire history', () => {
    recordRecentSearch('github');
    recordRecentSearch('gmail');
    clearRecentSearches();
    expect(readRecentSearches()).toEqual([]);
  });

  it('survives a corrupt localStorage value', () => {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, '{not json');
    expect(readRecentSearches()).toEqual([]);
  });

  it('automatically wipes history on closeVaultSession', async () => {
    recordRecentSearch('secret-bank');
    expect(readRecentSearches()).toHaveLength(1);

    const { closeVaultSession } = await import('./vaultSession');
    closeVaultSession(true);

    expect(readRecentSearches()).toEqual([]);
    expect(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
  });

  it('rejects non-array JSON payloads stored under the key', () => {
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify({ not: 'an array' }));
    expect(readRecentSearches()).toEqual([]);
  });

  it('filters malformed entries and caps reads at MAX_RECENT_SEARCHES', () => {
    const entries: unknown[] = [
      null,
      'not-an-object',
      { query: 42, lastUsedAt: '2026-01-01T00:00:00.000Z' },
      { query: 'valid-but-no-timestamp' },
      { query: '   ', lastUsedAt: '2026-01-01T00:00:00.000Z' },
      ...Array.from({ length: 12 }, (_, i) => ({
        query: `query-${i}`,
        lastUsedAt: `2026-01-0${(i % 9) + 1}T00:00:00.000Z`,
      })),
    ];
    window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(entries));
    const stored = readRecentSearches();
    // All malformed entries are dropped; only the first MAX survive.
    expect(stored).toHaveLength(MAX_RECENT_SEARCHES);
    expect(stored.every((entry) => entry.query.startsWith('query-'))).toBe(true);
    expect(stored[0]!.query).toBe('query-0');
  });

  it('removes the storage key entirely when the last entry is removed', () => {
    recordRecentSearch('github');
    removeRecentSearch('github');
    expect(window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY)).toBeNull();
  });

  it('matches removal case-insensitively', () => {
    recordRecentSearch('GitHub');
    const result = removeRecentSearch('github');
    expect(result).toEqual([]);
  });

  it('survives a throwing localStorage.getItem', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      expect(readRecentSearches()).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });

  it('survives a throwing localStorage.setItem when recording', () => {
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    try {
      const result = recordRecentSearch('github');
      expect(result.map((entry) => entry.query)).toEqual(['github']);
    } finally {
      spy.mockRestore();
    }
  });

  it('degrades gracefully when window/localStorage is unavailable', async () => {
    const { clearRecentSearches } = await import('./recentSearches');
    vi.stubGlobal('window', undefined);
    try {
      expect(readRecentSearches()).toEqual([]);
      // Recording still succeeds in memory; persistence is a silent no-op.
      expect(recordRecentSearch('offline').map((e) => e.query)).toEqual(['offline']);
      expect(removeRecentSearch('offline')).toEqual([]);
      expect(() => clearRecentSearches()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
