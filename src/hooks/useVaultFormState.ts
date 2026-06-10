import { useState } from 'react';

import { VaultItem } from '../types';

export function useVaultFormState() {
  const [isVaultFormOpen, setIsVaultFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  const openNewItemForm = () => {
    setEditingItem(null);
    setIsVaultFormOpen(true);
  };

  const openEditItemForm = (item: VaultItem | null) => {
    if (!item) return;

    setEditingItem(item);
    setIsVaultFormOpen(true);
  };

  const closeVaultForm = () => {
    setIsVaultFormOpen(false);
  };

  return {
    isVaultFormOpen,
    editingItem,
    openNewItemForm,
    openEditItemForm,
    closeVaultForm,
  };
}
