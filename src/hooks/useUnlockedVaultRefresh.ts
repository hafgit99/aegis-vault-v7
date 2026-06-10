import { useEffect } from 'react';

interface UseUnlockedVaultRefreshOptions {
  unlocked: boolean;
  onRefresh: () => void | Promise<void>;
}

export function useUnlockedVaultRefresh({ unlocked, onRefresh }: UseUnlockedVaultRefreshOptions) {
  useEffect(() => {
    if (unlocked) {
      void onRefresh();
    }
  }, [onRefresh, unlocked]);
}
