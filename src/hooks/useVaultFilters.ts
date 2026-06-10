import { useState } from 'react';

export function useVaultFilters() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);

  return {
    searchQuery,
    setSearchQuery,
    filterFavoritesOnly,
    setFilterFavoritesOnly,
  };
}
