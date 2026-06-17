import { invoke } from '@tauri-apps/api/core';

export async function enableNativeScreenCaptureProtection(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) return false;

  try {
    return await invoke<boolean>('enable_screen_capture_protection');
  } catch {
    return false;
  }
}
