import { useState } from 'react';

export type VaultCategoryFilter = 'all' | 'login' | 'card' | 'passkey' | 'identity' | 'secure_note';

export function useVaultFilters() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<VaultCategoryFilter>('all');

  return {
    searchQuery,
    setSearchQuery,
    filterFavoritesOnly,
    setFilterFavoritesOnly,
    selectedCategory,
    setSelectedCategory,
  };
}
