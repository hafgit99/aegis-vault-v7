import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { closeVaultSession, getVaultSessionSnapshot, subscribeToVaultSession } from '../lib/vaultSession';
import { clearExtensionCredentials } from '../lib/desktopStorage';
import { useAutoLock } from '../hooks/useAutoLock';

interface VaultSessionContextValue {
  unlocked: boolean;
  lock: () => void;
}

const VaultSessionContext = createContext<VaultSessionContextValue | null>(null);

interface VaultSessionProviderProps {
  children: React.ReactNode;
  autoLockDuration?: number;
  resetReveals?: () => void;
  clearCopiedField?: () => void;
}

export function VaultSessionProvider({
  children,
  autoLockDuration = 300,
  resetReveals,
  clearCopiedField,
}: VaultSessionProviderProps) {
  const unlocked = useSyncExternalStore(subscribeToVaultSession, getVaultSessionSnapshot);

  const lock = React.useCallback(() => {
    closeVaultSession();
    clearExtensionCredentials();
    resetReveals?.();
    clearCopiedField?.();
  }, [clearCopiedField, resetReveals]);

  useAutoLock({
    unlocked,
    durationSeconds: autoLockDuration,
    onLock: lock,
  });

  return (
    <VaultSessionContext.Provider value={{ unlocked, lock }}>
      {children}
    </VaultSessionContext.Provider>
  );
}

export function useVaultSessionContext(): VaultSessionContextValue {
  const context = useContext(VaultSessionContext);
  if (!context) {
    throw new Error('useVaultSessionContext must be used within a VaultSessionProvider');
  }
  return context;
}
