import { useCallback, useState } from 'react';

import { VaultItem } from '../types';
import { getVaultItems, saveVaultItem } from '../lib/storage';

export function useVaultData() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);

  const refreshDatabase = useCallback(async () => {
    const loaded = await getVaultItems();
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

  const saveItem = async (item: VaultItem) => {
    const updated = await saveVaultItem(item);
    setItems(updated);

    const saved = updated.find((entry) => entry.title === item.title && entry.username === item.username);
    if (saved) {
      setSelectedItem(saved);
    }
  };

  const toggleFavorite = async (item: VaultItem) => {
    const updatedItem = { ...item, favorite: !item.favorite };
    const updated = await saveVaultItem(updatedItem);
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
