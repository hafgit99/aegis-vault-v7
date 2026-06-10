import { invoke } from '@tauri-apps/api/core';

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
