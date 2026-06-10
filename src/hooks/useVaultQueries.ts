import { useMemo } from 'react';
import { VaultItem } from '../types';
import { runVaultAudit } from '../lib/security';

interface UseVaultQueriesOptions {
  items: VaultItem[];
  searchQuery: string;
  favoritesOnly: boolean;
}

export function useVaultQueries({ items, searchQuery, favoritesOnly }: UseVaultQueriesOptions) {
  return useMemo(() => {
    const activeItems = items.filter((item) => !item.deleted);
    const trashItems = items.filter((item) => item.deleted);
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const filteredItems = activeItems.filter((item) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.username.toLowerCase().includes(normalizedQuery) ||
        (item.url && item.url.toLowerCase().includes(normalizedQuery));

      return favoritesOnly ? matchesSearch && item.favorite : matchesSearch;
    });

    return {
      activeItems,
      trashItems,
      filteredItems,
      favoriteCount: activeItems.filter((item) => item.favorite).length,
      loginCount: activeItems.filter((item) => item.category === 'login').length,
      cardCount: activeItems.filter((item) => item.category === 'card').length,
      secureNoteCount: activeItems.filter((item) => item.category === 'secure_note').length,
      auditReport: runVaultAudit(activeItems),
    };
  }, [favoritesOnly, items, searchQuery]);
}
