import { useCallback, useSyncExternalStore } from 'react';

import { useAutoLock } from './useAutoLock';
import { closeVaultSession, subscribeToVaultSession, getVaultSessionSnapshot, openVaultSession, hasActiveVaultSession } from '../lib/vaultSession';
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
  const unlocked = useSyncExternalStore(subscribeToVaultSession, getVaultSessionSnapshot);

  const lock = useCallback(() => {
    closeVaultSession();
    clearExtensionCredentials();
    resetReveals();
    clearCopiedField();
  }, [clearCopiedField, resetReveals]);

  useAutoLock({
    unlocked,
    durationSeconds: autoLockDuration,
    onLock: lock,
  });

  return {
    unlocked,
    lock,
  };
}

