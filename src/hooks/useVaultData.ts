import { useCallback, useState } from 'react';

import type { VaultItem } from '../types';
import { getVaultItems, purgeExpiredTrashItems, saveVaultItem, saveVaultItems } from '../lib/storage';
import { hasActiveMasterPassword } from '../lib/vaultSession';
import { isVaultWriteConflictError } from '../lib/vaultWriteCoordination';
import { isTestEnv } from '../lib/environment';

const maybeDelay = async (ms: number): Promise<void> => {
  if (isTestEnv) return;
  await new Promise(resolve => setTimeout(resolve, ms));
};

export interface VaultWriteConflictState {
  baselineVersion: number;
  currentVersion: number;
}

export function useVaultData() {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);
  /** Y-15: set when a write was refused because another tab is ahead of us. */
  const [writeConflict, setWriteConflict] = useState<VaultWriteConflictState | null>(null);

  const clearWriteConflict = useCallback(() => setWriteConflict(null), []);

  const refreshDatabase = useCallback(async () => {
    // Y-14: retention is enforced here, explicitly, rather than as a side
    // effect of reading. This is the only automatic call site, and it logs a
    // `storage.trashRetention.purged` event — an irreversible multi-row delete
    // must never be silent.
    //
    // A failure here must not break the refresh: the trash is already expired
    // and losing it is the safe outcome compared to showing an empty vault.
    let loaded: VaultItem[];
    try {
      const purged = await purgeExpiredTrashItems();
      loaded = purged.items;
    } catch {
      loaded = await getVaultItems();
    }

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

  /**
   * Y-14 (second half): apply a write result to the UI only when a session is
   * actually open.
   *
   * `withSessionVaultKey` returns its fallback (`[]`) when the vault is locked,
   * so a save issued after auto-lock used to call `setItems([])` — emptying the
   * visible list even though nothing was written. To the user that looks exactly
   * like a successful save followed by a vanished vault.
   */
  const applyWriteResult = (updated: VaultItem[]): VaultItem[] => {
    if (!hasActiveMasterPassword()) {
      return updated;
    }
    setItems(updated);
    return updated;
  };

  /**
   * Y-15: runs a write and records a cross-tab conflict instead of letting it
   * surface as an opaque failure.
   *
   * `VaultWriteConflictError` means the write was *deliberately refused* because
   * another tab committed a newer version. The data is safe, but the user's edit
   * did not land and their view is behind — which is a very different thing from
   * "save failed", and has to be reported as such.
   */
  const runWrite = useCallback(async <T,>(write: () => Promise<T>): Promise<T | null> => {
    try {
      return await write();
    } catch (err) {
      if (isVaultWriteConflictError(err)) {
        setWriteConflict({
          baselineVersion: err.baselineVersion,
          currentVersion: err.currentVersion,
        });
        // The list on screen is stale, so it must not be replaced by the
        // fallback value the storage layer returns for a failed write.
        return null;
      }
      throw err;
    }
  }, []);

  const saveItem = async (item: VaultItem) => {
    const result = await runWrite(() => saveVaultItem(item));
    if (result === null) return;
    const updated = result;
    applyWriteResult(updated);

    const saved = updated.find((entry) => entry.id === item.id)
      ?? updated.find((entry) => entry.title === item.title && entry.username === item.username);
    if (saved) {
      setSelectedItem(saved);
    }
  };

  const saveItems = async (itemsToSave: VaultItem[]) => {
    const updated = await runWrite(() => saveVaultItems(itemsToSave));
    if (updated === null) return;
    applyWriteResult(updated);
  };

  const toggleFavorite = async (item: VaultItem) => {
    const updatedItem = { ...item, favorite: !item.favorite };
    const result = await runWrite(() => saveVaultItem(updatedItem));
    if (result === null) return;
    const updated = result;
    applyWriteResult(updated);
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
    writeConflict,
    clearWriteConflict,
  };
}
