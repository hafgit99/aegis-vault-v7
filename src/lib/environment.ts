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

/**
 * `true` inside jsdom / happy-dom unit test environments.
 * Used to skip real timers (e.g. `maybeDelay`) during tests.
 */
export const isTestEnv =
  typeof window === 'undefined' ||
  (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('jsdom')) ||
  (typeof window !== 'undefined' && Boolean((window as { __happyDOM__?: unknown }).__happyDOM__));
