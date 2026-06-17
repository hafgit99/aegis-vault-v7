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
      getPendingRequest(): string | null;
      clearPendingRequest(requestId: string): boolean;
    };
    __aegisAndroidAutofill?: {
      onRequest(request: AndroidAutofillRequest | null): void;
    };
  }
}

export interface AndroidAutofillRequest {
  requestId: string;
  createdAt: number;
  source: 'android-autofill';
}

type AndroidAutofillRequestListener = (request: AndroidAutofillRequest) => void;

const listeners = new Set<AndroidAutofillRequestListener>();

function androidAutofillBridge(): NonNullable<Window['AegisAndroidAutofill']> | null {
  if (typeof window === 'undefined') return null;
  return window.AegisAndroidAutofill ?? null;
}

function isAndroidAutofillRequest(value: unknown): value is AndroidAutofillRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AndroidAutofillRequest>;
  return typeof candidate.requestId === 'string' &&
    typeof candidate.createdAt === 'number' &&
    candidate.source === 'android-autofill';
}

function parsePendingRequest(payload: string | null): AndroidAutofillRequest | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);
    return isAndroidAutofillRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function ensureAndroidAutofillCallback(): void {
  if (typeof window === 'undefined') return;

  window.__aegisAndroidAutofill = {
    onRequest(request) {
      if (!isAndroidAutofillRequest(request)) return;
      listeners.forEach((listener) => listener(request));
    },
  };
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

export function getPendingAndroidAutofillRequest(): AndroidAutofillRequest | null {
  const bridge = androidAutofillBridge();
  if (!bridge) return null;

  try {
    return parsePendingRequest(bridge.getPendingRequest());
  } catch {
    return null;
  }
}

export function clearPendingAndroidAutofillRequest(requestId: string): boolean {
  const bridge = androidAutofillBridge();
  if (!bridge) return false;

  try {
    return Boolean(bridge.clearPendingRequest(requestId));
  } catch {
    return false;
  }
}

export function subscribeAndroidAutofillRequests(listener: AndroidAutofillRequestListener): () => void {
  ensureAndroidAutofillCallback();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
