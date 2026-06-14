import { useMemo } from 'react';
import { VaultItem } from '../types';
import { runVaultAudit } from '../lib/security';
import type { VaultCategoryFilter } from './useVaultFilters';

interface UseVaultQueriesOptions {
  items: VaultItem[];
  searchQuery: string;
  favoritesOnly: boolean;
  selectedCategory: VaultCategoryFilter;
}

export function useVaultQueries({ items, searchQuery, favoritesOnly, selectedCategory }: UseVaultQueriesOptions) {
  // 1. Memoize item classifications and security audit.
  // This ONLY recalculates when the vault item collection itself changes.
  const auditState = useMemo(() => {
    const activeItems = items.filter((item) => !item.deleted);
    const trashItems = items.filter((item) => item.deleted);
    const favoriteCount = activeItems.filter((item) => item.favorite).length;
    const loginCount = activeItems.filter((item) => item.category === 'login').length;
    const cardCount = activeItems.filter((item) => item.category === 'card').length;
    const secureNoteCount = activeItems.filter((item) => item.category === 'secure_note').length;
    const passkeyCount = activeItems.filter((item) => item.category === 'passkey').length;
    const identityCount = activeItems.filter((item) => item.category === 'identity').length;
    const auditReport = runVaultAudit(activeItems);

    return {
      activeItems,
      trashItems,
      favoriteCount,
      loginCount,
      cardCount,
      secureNoteCount,
      passkeyCount,
      identityCount,
      auditReport,
    };
  }, [items]);

  // 2. Memoize list filtering.
  // This runs on search query inputs, but doesn't waste CPU recalculating the audit report.
  const filteredItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return auditState.activeItems.filter((item) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.username.toLowerCase().includes(normalizedQuery) ||
        (item.url && item.url.toLowerCase().includes(normalizedQuery));

      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;

      return favoritesOnly
        ? matchesSearch && matchesCategory && item.favorite
        : matchesSearch && matchesCategory;
    });
  }, [auditState.activeItems, favoritesOnly, searchQuery, selectedCategory]);

  return {
    activeItems: auditState.activeItems,
    trashItems: auditState.trashItems,
    filteredItems,
    favoriteCount: auditState.favoriteCount,
    loginCount: auditState.loginCount,
    cardCount: auditState.cardCount,
    secureNoteCount: auditState.secureNoteCount,
    passkeyCount: auditState.passkeyCount,
    identityCount: auditState.identityCount,
    auditReport: auditState.auditReport,
  };
}

