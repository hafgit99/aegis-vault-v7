import { useCallback, useSyncExternalStore } from 'react';

import { useAutoLock } from './useAutoLock';
import { checkAndTriggerAutoSnapshot } from '../lib/snapshots';
import { closeVaultSession, subscribeToVaultSession, getVaultSessionSnapshot } from '../lib/vaultSession';
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
    // K-7: trigger the auto backup BEFORE zeroizing the session. The snapshot
    // callback captures session secrets synchronously, so it completes on its
    // own clones while the lock takes effect immediately. Failures are
    // swallowed inside checkAndTriggerAutoSnapshot (resolves to null).
    void checkAndTriggerAutoSnapshot('lock');
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

