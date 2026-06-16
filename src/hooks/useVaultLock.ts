import { useCallback, useState } from 'react';

import { useAutoLock } from './useAutoLock';
import { closeVaultSession } from '../lib/vaultSession';
import { clearExtensionCredentials } from '../lib/desktopStorage';

interface UseVaultLockOptions {
  autoLockDuration: number;
  resetReveals: () => void;
  clearCopiedField: () => void;
}

export function useVaultLock({
  autoLockDuration,
  resetReveals,
  clearCopiedField,
}: UseVaultLockOptions) {
  const [unlocked, setUnlocked] = useState(false);

  const lock = useCallback(() => {
    closeVaultSession();
    clearExtensionCredentials();
    setUnlocked(false);
    resetReveals();
    clearCopiedField();
  }, [clearCopiedField, resetReveals]);

  const unlock = useCallback(() => {
    setUnlocked(true);
  }, []);

  useAutoLock({
    unlocked,
    durationSeconds: autoLockDuration,
    onLock: lock,
  });

  return {
    unlocked,
    unlock,
    lock,
  };
}
