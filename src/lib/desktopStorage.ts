import { invoke } from '@tauri-apps/api/core';
import { VaultItem } from '../types';

export const EXTENSION_CREDENTIAL_LEASE_MS = 5 * 60 * 1000;

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

export async function readDesktopVaultDatabase(): Promise<string | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<string | null>('read_vault_database');
}

export async function writeDesktopVaultDatabase(contents: string): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  await invoke('write_vault_database', { contents });
  return true;
}

export async function resetDesktopVaultDatabase(): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
  await invoke('reset_vault_database');
  return true;
}

export async function syncExtensionCredentials(items: VaultItem[], ttlMs = EXTENSION_CREDENTIAL_LEASE_MS): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    const creds = items
      .filter(item => !item.deleted)
      .map(item => ({
        id: item.id,
        title: item.title,
        username: item.username || item.cardholderName || '',
        password: item.password || item.cardNumber || '',
        url: item.url || '',
        category: item.category,
        favorite: Boolean(item.favorite),
      }));
    await invoke('sync_extension_credentials', { credentials: creds, ttlMs });
  } catch (error) {
    console.error('Failed to sync credentials to extension:', error);
  }
}

export async function clearExtensionCredentials(): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    await invoke('clear_extension_credentials');
  } catch (error) {
    console.error('Failed to clear extension credentials:', error);
  }
}
