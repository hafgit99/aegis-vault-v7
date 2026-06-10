import { useCallback } from 'react';
import { ActiveTab, VaultItem } from '../types';

interface UseVaultSelectionOptions {
  setSelectedItem: (item: VaultItem) => void;
  resetReveals: () => void;
  clearCopiedField: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  setMobileActiveView: (view: 'list' | 'detail') => void;
}

export function useVaultSelection({
  setSelectedItem,
  resetReveals,
  clearCopiedField,
  setActiveTab,
  setMobileActiveView,
}: UseVaultSelectionOptions) {
  const selectItem = useCallback(
    (item: VaultItem) => {
      setSelectedItem(item);
      resetReveals();
      clearCopiedField();
      setMobileActiveView('detail');
    },
    [clearCopiedField, resetReveals, setMobileActiveView, setSelectedItem],
  );

  const selectAuditItem = useCallback(
    (item: VaultItem) => {
      selectItem(item);
      setActiveTab('vault');
    },
    [selectItem, setActiveTab],
  );

  return {
    selectItem,
    selectAuditItem,
  };
}
