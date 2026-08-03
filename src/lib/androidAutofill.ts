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
      getPendingSaveCandidate?(): string | null;
      clearPendingSaveCandidate?(requestId: string): boolean;
      /**
       * Resolves an encrypted autofill save payload referenced by
       * [payloadUri] + [payloadToken]. Returns the JSON of the candidate with
       * the decrypted password in place, or null if the payload has already
       * been consumed, expired, or failed the integrity check.
       *
       * Implementations are expected to delete the backing file after a
       * successful read so a single payload cannot be replayed.
       */
      resolveEncryptedSavePayload?(requestId: string): string | null;
    };
    __aegisAndroidAutofill?: {
      onRequest(request: AndroidAutofillRequest | null): void;
      onSave(candidate: AndroidAutofillSaveCandidate | null): void;
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

export interface AndroidAutofillSaveCandidate {
  requestId: string;
  createdAt: number;
  source: 'android-autofill-save';
  title: string;
  username: string;
  password: string;
  url?: string | null;
  appPackage?: string | null;
  webDomain?: string | null;
  /**
   * Optional FileProvider URI pointing at an AES-256-GCM encrypted payload
   * staged in the app's private cache directory. Combined with
   * [payloadToken] this lets the WebView recover the password without ever
   * letting it travel through Intent extras.
   */
  payloadUri?: string | null;
  /**
   * Token required to decrypt the payload referenced by [payloadUri]. The
   * token never leaves the secure temp file boundary; the native bridge
   * consumes it on demand and deletes the file as soon as the JSON is
   * returned to JS.
   */
  payloadToken?: string | null;
}

type AndroidAutofillRequestListener = (request: AndroidAutofillRequest) => void;
type AndroidAutofillSaveCandidateListener = (candidate: AndroidAutofillSaveCandidate) => void;

export const ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS = 5 * 60 * 1000;

const listeners = new Set<AndroidAutofillRequestListener>();
const saveCandidateListeners = new Set<AndroidAutofillSaveCandidateListener>();

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

function isAndroidAutofillSaveCandidate(value: unknown): value is AndroidAutofillSaveCandidate {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AndroidAutofillSaveCandidate>;
  const hasValidAppPackage = candidate.appPackage === undefined || candidate.appPackage === null || typeof candidate.appPackage === 'string';
  const hasValidWebDomain = candidate.webDomain === undefined || candidate.webDomain === null || typeof candidate.webDomain === 'string';
  const hasValidUrl = candidate.url === undefined || candidate.url === null || typeof candidate.url === 'string';
  const hasValidPayloadUri = candidate.payloadUri === undefined || candidate.payloadUri === null || typeof candidate.payloadUri === 'string';
  const hasValidPayloadToken = candidate.payloadToken === undefined || candidate.payloadToken === null || typeof candidate.payloadToken === 'string';

  return typeof candidate.requestId === 'string' &&
    typeof candidate.createdAt === 'number' &&
    candidate.source === 'android-autofill-save' &&
    typeof candidate.title === 'string' &&
    typeof candidate.username === 'string' &&
    typeof candidate.password === 'string' &&
    hasValidUrl &&
    hasValidAppPackage &&
    hasValidWebDomain &&
    hasValidPayloadUri &&
    hasValidPayloadToken;
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

function parsePendingSaveCandidate(payload: string | null): AndroidAutofillSaveCandidate | null {
  if (!payload) return null;

  try {
    const parsed = JSON.parse(payload);
    return isAndroidAutofillSaveCandidate(parsed) ? parsed : null;
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
    onSave(candidate) {
      if (!isAndroidAutofillSaveCandidate(candidate)) return;
      saveCandidateListeners.forEach((listener) => listener(candidate));
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

export function getPendingAndroidAutofillSaveCandidate(): AndroidAutofillSaveCandidate | null {
  const bridge = androidAutofillBridge();
  if (!bridge || !bridge.getPendingSaveCandidate) return null;

  try {
    return parsePendingSaveCandidate(bridge.getPendingSaveCandidate());
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

export function clearPendingAndroidAutofillSaveCandidate(requestId: string): boolean {
  const bridge = androidAutofillBridge();
  if (!bridge || !bridge.clearPendingSaveCandidate) return false;

  try {
    return Boolean(bridge.clearPendingSaveCandidate(requestId));
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

/**
 * Requests that the native bridge decrypt and return the encrypted save
 * candidate associated with [requestId]. Returns null when the bridge does
 * not implement the new path, the payload is missing, the integrity check
 * fails, or the candidate has already been consumed.
 *
 * The native side deletes the encrypted file as soon as the JSON is returned,
 * so callers must treat the result as a one-shot read.
 */
export function resolveEncryptedAndroidAutofillSaveCandidate(
  requestId: string,
): AndroidAutofillSaveCandidate | null {
  const bridge = androidAutofillBridge();
  if (!bridge || !bridge.resolveEncryptedSavePayload) return null;

  try {
    return parsePendingSaveCandidate(bridge.resolveEncryptedSavePayload(requestId));
  } catch {
    return null;
  }
}

/**
 * Returns true when the supplied candidate carries an encrypted FileProvider
 * payload that still needs to be resolved through the native bridge. In that
 * case the [AndroidAutofillSaveCandidate.password] field is empty.
 */
export function requiresEncryptedAutofillSaveResolution(
  candidate: AndroidAutofillSaveCandidate | null | undefined,
): boolean {
  if (!candidate) return false;
  return Boolean(candidate.payloadUri && candidate.payloadToken && candidate.password === '');
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

export function subscribeAndroidAutofillSaveCandidates(listener: AndroidAutofillSaveCandidateListener): () => void {
  ensureAndroidAutofillCallback();
  saveCandidateListeners.add(listener);

  return () => {
    saveCandidateListeners.delete(listener);
  };
}
