import { useEffect } from 'react';
import { syncExtensionCredentials, clearExtensionCredentials } from '../lib/desktopStorage';
import type { VaultItem } from '../types';

/**
 * Keeps the native-messaging credential cache in sync with the vault:
 * pushes the item list once a minute while unlocked and wipes the
 * cached credentials as soon as the vault locks.
 */
export function useExtensionCredentialSync(unlocked: boolean, items: VaultItem[]) {
  useEffect(() => {
    if (!unlocked) {
      clearExtensionCredentials();
      return;
    }

    syncExtensionCredentials(items);
    const interval = window.setInterval(() => {
      syncExtensionCredentials(items);
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [unlocked, items]);
}
