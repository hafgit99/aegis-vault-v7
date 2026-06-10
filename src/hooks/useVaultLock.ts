import { useCallback, useState } from 'react';

import { useAutoLock } from './useAutoLock';

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
    setUnlocked(false);
    resetReveals();
    clearCopiedField();
  }, [clearCopiedField, resetReveals]);

  const unlock = () => {
    setUnlocked(true);
  };

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
