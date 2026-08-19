import { useCallback, useState } from 'react';

import type { VaultItem } from '../types';
import { getVaultItems, saveVaultItem, saveVaultItems } from '../lib/storage';
import { isTestEnv } from '../lib/environment';

const maybeDelay = async (ms: number): Promise<void> => {
  if (isTestEnv) return;
  await new Promise(resolve => setTimeout(resolve, ms));
};

export function useVaultData() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);

  const refreshDatabase = useCallback(async () => {
    const loaded = await getVaultItems();
    
    // For large datasets (100+ items), render progressively in very small batches
    // to prevent massive React re-renders from blocking the UI.
    // This allows the browser to flush updates incrementally.
    if (loaded.length > 100) {
      const BATCH_SIZE = 50;  // Reduced from 100 for more responsive rendering
      
      // Display items in batches to allow browser to render progressively
      for (let i = 0; i < loaded.length; i += BATCH_SIZE) {
        const batchItems = loaded.slice(0, i + BATCH_SIZE);
        setItems(batchItems);
        
        // Always yield to event loop between batches
        if (i + BATCH_SIZE < loaded.length) {
          await maybeDelay(20);
        }
      }
    } else {
      // For smaller datasets, set all items at once (faster)
      setItems(loaded);
    }

    const activeLoaded = loaded.filter((item) => !item.deleted);
    if (activeLoaded.length === 0) {
      setSelectedItem(null);
      return;
    }

    setSelectedItem((current) => {
      if (current && !current.deleted) {
        const stillExists = activeLoaded.find((item) => item.id === current.id);
        return stillExists || activeLoaded[0]!;
      }

      return activeLoaded[0]!;
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

  const saveItems = async (itemsToSave: VaultItem[]) => {
    const updated = await saveVaultItems(itemsToSave);
    setItems(updated);
  };

  const toggleFavorite = async (item: VaultItem) => {
    const updatedItem = { ...item, favorite: !item.favorite };
    const updated = await saveVaultItem(updatedItem);
    setItems(updated);
    setSelectedItem(updated.find((entry) => entry.id === item.id) ?? updatedItem);
  };

  return {
    items,
    selectedItem,
    setItems,
    setSelectedItem,
    refreshDatabase,
    saveItem,
    saveItems,
    toggleFavorite,
  };
}
