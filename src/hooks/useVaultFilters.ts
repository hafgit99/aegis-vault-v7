import { useCallback, useEffect, useState } from 'react';

import {
  clearRecentSearches,
  readRecentSearches,
  recordRecentSearch,
  removeRecentSearch,
  type RecentSearchEntry,
} from '../lib/recentSearches';

export type VaultCategoryFilter = 'all' | 'login' | 'card' | 'passkey' | 'identity' | 'secure_note';

/**
 * Date range used to narrow down vault items by `createdAt` or
 * `updatedAt`. Both bounds are inclusive and ISO-8601 strings (or
 * `null` to indicate "no lower / upper bound"). Empty strings are
 * treated the same as `null` for convenience.
 */
export interface VaultDateRange {
  from: string | null;
  to: string | null;
}

const emptyDateRange: VaultDateRange = { from: null, to: null };

function normaliseDateRange(range: VaultDateRange): VaultDateRange {
  const from = range.from && range.from.trim() ? range.from.trim() : null;
  const to = range.to && range.to.trim() ? range.to.trim() : null;
  return { from, to };
}

function rangesEqual(a: VaultDateRange, b: VaultDateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

export function useVaultFilters() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<VaultCategoryFilter>('all');

  // ── Advanced search additions ────────────────────────────────────
  const [fuzzyEnabled, setFuzzyEnabled] = useState(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<VaultDateRange>(emptyDateRange);
  const [dateField, setDateField] = useState<'createdAt' | 'updatedAt'>('updatedAt');
  const [recentSearches, setRecentSearches] = useState<RecentSearchEntry[]>(() => readRecentSearches());

  // Persist recent searches when the user actually performs a query.
  // The hook only re-hydrates from localStorage on mount; subsequent
  // writes are routed through the helpers above to keep state in sync.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'aegis-vault-v7-recent-searches') {
        setRecentSearches(readRecentSearches());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const commitSearch = useCallback((query: string) => {
    setSearchQuery(query);
    const trimmed = query.trim();
    if (trimmed) {
      setRecentSearches(recordRecentSearch(trimmed));
    }
  }, []);

  const removeRecentEntry = useCallback((query: string) => {
    setRecentSearches(removeRecentSearch(query));
  }, []);

  const clearRecent = useCallback(() => {
    clearRecentSearches();
    setRecentSearches([]);
  }, []);

  const toggleTag = useCallback((tag: string) => {
    const normalised = tag.trim().toLowerCase();
    if (!normalised) return;
    setSelectedTags((current) =>
      current.includes(normalised)
        ? current.filter((t) => t !== normalised)
        : [...current, normalised],
    );
  }, []);

  const clearTags = useCallback(() => setSelectedTags([]), []);

  const updateDateRange = useCallback((next: VaultDateRange) => {
    setDateRange((current) => {
      const normalised = normaliseDateRange(next);
      return rangesEqual(current, normalised) ? current : normalised;
    });
  }, []);

  const clearDateRange = useCallback(() => setDateRange(emptyDateRange), []);

  const resetAdvancedFilters = useCallback(() => {
    setSelectedTags([]);
    setDateRange(emptyDateRange);
    setFuzzyEnabled(true);
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    commitSearch,
    filterFavoritesOnly,
    setFilterFavoritesOnly,
    selectedCategory,
    setSelectedCategory,
    // Advanced search additions
    fuzzyEnabled,
    setFuzzyEnabled,
    selectedTags,
    toggleTag,
    clearTags,
    dateRange,
    dateField,
    setDateField,
    updateDateRange,
    clearDateRange,
    recentSearches,
    removeRecentEntry,
    clearRecent,
    resetAdvancedFilters,
  };
}

