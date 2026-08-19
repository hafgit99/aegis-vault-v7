import { useState, useCallback } from 'react';

import type { VaultItem } from '../types';

export function useVaultFormState() {
  const [isVaultFormOpen, setIsVaultFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  const openNewItemForm = useCallback((prefill?: Partial<VaultItem> | null) => {
    if (prefill) {
      setEditingItem({
        id: '',
        title: prefill.title || '',
        username: prefill.username || '',
        password: prefill.password || '',
        url: prefill.url || '',
        category: prefill.category || 'login',
        createdAt: new Date().toISOString().split('T')[0],
        updatedAt: new Date().toISOString().split('T')[0],
      } as VaultItem);
    } else {
      setEditingItem(null);
    }
    setIsVaultFormOpen(true);
  }, []);

  const openEditItemForm = useCallback((item: VaultItem | null) => {
    if (!item) return;

    setEditingItem(item);
    setIsVaultFormOpen(true);
  }, []);

  const closeVaultForm = useCallback(() => {
    setIsVaultFormOpen(false);
  }, []);

  return {
    isVaultFormOpen,
    editingItem,
    openNewItemForm,
    openEditItemForm,
    closeVaultForm,
  };
}
