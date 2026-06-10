import { useCallback, useState } from 'react';

import { VaultItem } from '../types';
import { getVaultItems, saveVaultItem } from '../lib/storage';

export function useVaultData() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);

  const refreshDatabase = useCallback(() => {
    const loaded = getVaultItems();
    setItems(loaded);

    const activeLoaded = loaded.filter((item) => !item.deleted);
    if (activeLoaded.length === 0) {
      setSelectedItem(null);
      return;
    }

    setSelectedItem((current) => {
      if (current && !current.deleted) {
        const stillExists = activeLoaded.find((item) => item.id === current.id);
        return stillExists || activeLoaded[0];
      }

      return activeLoaded[0];
    });
  }, []);

  const saveItem = (item: VaultItem) => {
    const updated = saveVaultItem(item);
    setItems(updated);

    const saved = updated.find((entry) => entry.title === item.title && entry.username === item.username);
    if (saved) {
      setSelectedItem(saved);
    }
  };

  const toggleFavorite = (item: VaultItem) => {
    const updatedItem = { ...item, favorite: !item.favorite };
    const updated = saveVaultItem(updatedItem);
    setItems(updated);
    setSelectedItem(updatedItem);
  };

  return {
    items,
    selectedItem,
    setItems,
    setSelectedItem,
    refreshDatabase,
    saveItem,
    toggleFavorite,
  };
}
