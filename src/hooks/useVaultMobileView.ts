import { useState } from 'react';

import type { VaultItem } from '../types';

type MobileActiveView = 'list' | 'detail';

interface UseVaultMobileViewOptions {
  setSelectedItem: (item: VaultItem | null) => void;
}

export function useVaultMobileView({ setSelectedItem }: UseVaultMobileViewOptions) {
  const [mobileActiveView, setMobileActiveView] = useState<MobileActiveView>('list');

  const selectDashboard = () => {
    setSelectedItem(null);
    setMobileActiveView('detail');
  };

  const backToList = () => {
    setMobileActiveView('list');
  };

  return {
    mobileActiveView,
    setMobileActiveView,
    selectDashboard,
    backToList,
  };
}
