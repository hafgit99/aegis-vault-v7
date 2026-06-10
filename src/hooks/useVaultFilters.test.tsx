/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useVaultFilters } from './useVaultFilters';

afterEach(() => {
  cleanup();
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
});
