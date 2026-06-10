import { useEffect } from 'react';

interface UseUnlockedVaultRefreshOptions {
  unlocked: boolean;
  onRefresh: () => void;
}

export function useUnlockedVaultRefresh({ unlocked, onRefresh }: UseUnlockedVaultRefreshOptions) {
  useEffect(() => {
    if (unlocked) {
      onRefresh();
    }
  }, [onRefresh, unlocked]);
}
