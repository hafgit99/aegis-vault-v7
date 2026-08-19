/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
});
