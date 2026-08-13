/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useVaultFilters } from './useVaultFilters';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('useVaultFilters', () => {
  it('starts with an empty search and favorites disabled', () => {
    const { result } = renderHook(() => useVaultFilters());

    expect(result.current.searchQuery).toBe('');
    expect(result.current.filterFavoritesOnly).toBe(false);
  });

  it('updates the search query', () => {
    const { result } = renderHook(() => useVaultFilters());

    act(() => result.current.setSearchQuery('github'));

    expect(result.current.searchQuery).toBe('github');
  });

  it('toggles favorite-only filtering', () => {
    const { result } = renderHook(() => useVaultFilters());

    act(() => result.current.setFilterFavoritesOnly(true));

    expect(result.current.filterFavoritesOnly).toBe(true);
  });

  it('starts with fuzzy search enabled and an empty tag set', () => {
    const { result } = renderHook(() => useVaultFilters());

    expect(result.current.fuzzyEnabled).toBe(true);
    expect(result.current.selectedTags).toEqual([]);
  });

  it('toggles a tag, idempotently, and clears all tags', () => {
    const { result } = renderHook(() => useVaultFilters());

    act(() => result.current.toggleTag('work'));
    act(() => result.current.toggleTag('personal'));
    act(() => result.current.toggleTag('work')); // toggle off

    expect(result.current.selectedTags).toEqual(['personal']);

    act(() => result.current.clearTags());
    expect(result.current.selectedTags).toEqual([]);
  });

  it('records a search into the recent-searches history', () => {
    const { result } = renderHook(() => useVaultFilters());

    act(() => result.current.commitSearch('github'));
    expect(result.current.searchQuery).toBe('github');
    expect(result.current.recentSearches[0]?.query).toBe('github');
  });

  it('updates and clears the date range', () => {
    const { result } = renderHook(() => useVaultFilters());

    act(() => result.current.updateDateRange({ from: '2025-01-01', to: '2025-12-31' }));
    expect(result.current.dateRange.from).toBe('2025-01-01');
    expect(result.current.dateRange.to).toBe('2025-12-31');

    act(() => result.current.clearDateRange());
    expect(result.current.dateRange).toEqual({ from: null, to: null });
  });

  it('removes a single recent-search entry', () => {
    const { result } = renderHook(() => useVaultFilters());

    act(() => result.current.commitSearch('github'));
    act(() => result.current.commitSearch('gmail'));
    act(() => result.current.removeRecentEntry('github'));

    expect(result.current.recentSearches.map((entry) => entry.query)).toEqual(['gmail']);

    act(() => result.current.clearRecent());
    expect(result.current.recentSearches).toEqual([]);
  });

  it('resets all advanced filters', () => {
    const { result } = renderHook(() => useVaultFilters());

    act(() => {
      result.current.toggleTag('work');
      result.current.updateDateRange({ from: '2025-01-01', to: '2025-12-31' });
      result.current.setFuzzyEnabled(false);
    });

    expect(result.current.selectedTags).toEqual(['work']);
    expect(result.current.fuzzyEnabled).toBe(false);

    act(() => result.current.resetAdvancedFilters());

    expect(result.current.selectedTags).toEqual([]);
    expect(result.current.dateRange).toEqual({ from: null, to: null });
    expect(result.current.fuzzyEnabled).toBe(true);
  });
});

