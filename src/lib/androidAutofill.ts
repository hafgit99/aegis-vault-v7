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
      completePendingRequest(requestId: string, username: string, password: string, label: string): boolean;
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
  appPackage?: string | null;
  webDomain?: string | null;
  usernameFieldCount?: number;
  passwordFieldCount?: number;
  fillableFieldCount?: number;
}

type AndroidAutofillRequestListener = (request: AndroidAutofillRequest) => void;

export const ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;

const listeners = new Set<AndroidAutofillRequestListener>();

function androidAutofillBridge(): NonNullable<Window['AegisAndroidAutofill']> | null {
  if (typeof window === 'undefined') return null;
  return window.AegisAndroidAutofill ?? null;
}

function isAndroidAutofillRequest(value: unknown): value is AndroidAutofillRequest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AndroidAutofillRequest>;
  const hasValidAppPackage = candidate.appPackage === undefined || candidate.appPackage === null || typeof candidate.appPackage === 'string';
  const hasValidWebDomain = candidate.webDomain === undefined || candidate.webDomain === null || typeof candidate.webDomain === 'string';
  const hasValidUsernameFieldCount = candidate.usernameFieldCount === undefined ||
    (Number.isInteger(candidate.usernameFieldCount) && candidate.usernameFieldCount >= 0);
  const hasValidPasswordFieldCount = candidate.passwordFieldCount === undefined ||
    (Number.isInteger(candidate.passwordFieldCount) && candidate.passwordFieldCount >= 0);
  const hasValidFillableFieldCount = candidate.fillableFieldCount === undefined ||
    (Number.isInteger(candidate.fillableFieldCount) && candidate.fillableFieldCount >= 0);

  return typeof candidate.requestId === 'string' &&
    typeof candidate.createdAt === 'number' &&
    candidate.source === 'android-autofill' &&
    hasValidAppPackage &&
    hasValidWebDomain &&
    hasValidUsernameFieldCount &&
    hasValidPasswordFieldCount &&
    hasValidFillableFieldCount;
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

export function completePendingAndroidAutofillRequest(
  requestId: string,
  username: string,
  password: string,
  label: string,
): boolean {
  const bridge = androidAutofillBridge();
  if (!bridge) return false;

  try {
    return Boolean(bridge.completePendingRequest(requestId, username, password, label));
  } catch {
    return false;
  }
}

export function androidAutofillTargetLabel(request: AndroidAutofillRequest | null | undefined): string | null {
  if (!request) return null;

  const webDomain = request.webDomain?.trim();
  if (webDomain) return webDomain;

  const appPackage = request.appPackage?.trim();
  return appPackage || null;
}

export function isAndroidAutofillRequestFresh(
  request: AndroidAutofillRequest | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!request) return false;
  if (!Number.isFinite(request.createdAt)) return false;

  const ageMs = now - request.createdAt;
  return ageMs >= 0 && ageMs <= ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS;
}

export function subscribeAndroidAutofillRequests(listener: AndroidAutofillRequestListener): () => void {
  ensureAndroidAutofillCallback();
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
