/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

declare global {
  interface Window {
    AegisAndroidAutofill?: {
      isSupported(): boolean;
      isEnabled(): boolean;
      openSettings(): boolean;
    };
  }
}

function androidAutofillBridge(): NonNullable<Window['AegisAndroidAutofill']> | null {
  if (typeof window === 'undefined') return null;
  return window.AegisAndroidAutofill ?? null;
}

export function isAndroidAutofillSupported(): boolean {
  const bridge = androidAutofillBridge();
  if (!bridge) return false;

  try {
    return Boolean(bridge.isSupported());
  } catch {
    return false;
  }
}

export function isAndroidAutofillEnabled(): boolean {
  const bridge = androidAutofillBridge();
  if (!bridge) return false;

  try {
    return Boolean(bridge.isEnabled());
  } catch {
    return false;
  }
}

export function openAndroidAutofillSettings(): boolean {
  const bridge = androidAutofillBridge();
  if (!bridge) return false;

  try {
    return Boolean(bridge.openSettings());
  } catch {
    return false;
  }
}
