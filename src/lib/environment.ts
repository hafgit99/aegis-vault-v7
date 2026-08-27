/**
 * @file environment.ts
 * @description Single source of truth for runtime-environment detection flags.
 * Consolidates duplicated `isDesktopRuntime` / `isTestEnv` helpers that were
 * previously copy-pasted across `argon2id.ts`, `desktopStorage.ts`,
 * `SettingsPanel.tsx`, `useVaultData.ts` and `sqlite_opfs.ts`.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

/** `true` when running inside the Tauri desktop/Android native runtime. */
export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);
}

/** `true` when running inside the Android runtime (Tauri Android or WebView). */
export function isAndroidRuntime(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    /Android/i.test(navigator.userAgent || '')
  );
}

/** `true` when running on a true desktop platform (Windows, macOS, Linux) that supports binary auto-updates. */
export function isDesktopAppUpdaterSupported(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isDesktopRuntime()) return false;
  const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
  return true;
}

/**
 * `true` inside jsdom / happy-dom unit test environments.
 * Used to skip real timers (e.g. `maybeDelay`) during tests.
 */
export const isTestEnv =
  typeof window === 'undefined' ||
  (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) ||
  (typeof window !== 'undefined' && Boolean((window as { __happyDOM__?: unknown }).__happyDOM__));
