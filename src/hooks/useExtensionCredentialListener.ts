import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { VaultItem } from '../types';

type RawCredentialPayload = Partial<Pick<VaultItem, 'title' | 'username' | 'password' | 'url'>>;

/** Normalised (non-empty string) credential payload from the extension. */
export interface ExtensionCredentialPayload {
  title: string;
  username: string;
  password: string;
  url: string;
}

/**
 * Bridges the browser extension's "save credential" flow into the vault
 * by opening a pre-filled new-item form when the extension requests it.
 */
export function useExtensionCredentialListener(onAddCredential: (payload: ExtensionCredentialPayload) => void) {
  useEffect(() => {
    if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
      return;
    }

    let unlistenFn: (() => void) | null = null;

    listen<RawCredentialPayload>('add-credential-from-extension', (event) => {
      const payload = event.payload;
      if (payload) {
        onAddCredential({
          title: payload.title || '',
          username: payload.username || '',
          password: payload.password || '',
          url: payload.url || '',
        });
      }
    }).then((unlisten) => {
      unlistenFn = unlisten;
    }).catch(err => {
      console.error('Failed to listen to tauri add-credential event:', err);
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [onAddCredential]);
}
