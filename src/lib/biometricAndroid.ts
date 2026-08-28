/**
 * @file biometricAndroid.ts
 * @license SPDX-License-Identifier: Apache-2.0
 *
 * WebView <-> native glue for the biometric-bound AndroidKeyStore wrapping key
 * (RUST-O4). The native bridge (`AegisAndroidBiometric`) only exposes opaque
 * wrap/unwrap operations, each gated behind a BiometricPrompt + CryptoObject
 * so the OS authentication token is cryptographically bound to the key.
 *
 * On the JS side we exchange a base64 secret for an opaque handle (wrap) and
 * an opaque handle back to a base64 secret (unwrap), so the raw biometric
 * wrapping secret never persists — only its wrapped ciphertext handle does.
 */

/** Opaque JSON handle returned by the native wrap operation. */
export type AndroidBiometricHandle = string;

interface AegisAndroidBiometricBridge {
  wrap: (plaintextB64: string, callbackId: string) => void;
  unwrap: (handleJson: string, callbackId: string) => void;
  isAvailable: () => boolean;
  clear: () => boolean;
}

declare global {
  interface Window {
    AegisAndroidBiometric?: AegisAndroidBiometricBridge;
    __aegisBiometric?: {
      resolve: (callbackId: string, value: string) => void;
      reject: (callbackId: string, message: string) => void;
    };
  }
}

const ANDROID_BIOMETRIC_TIMEOUT_MS = 90_000;

const pendingCallbacks = new Map<
  string,
  { resolve: (value: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }
>();

let receiverInstalled = false;

function installReceiver(): void {
  if (receiverInstalled) return;
  receiverInstalled = true;
  window.__aegisBiometric = {
    resolve: (callbackId, value) => {
      const entry = pendingCallbacks.get(callbackId);
      if (!entry) return;
      pendingCallbacks.delete(callbackId);
      clearTimeout(entry.timer);
      entry.resolve(value);
    },
    reject: (callbackId, message) => {
      const entry = pendingCallbacks.get(callbackId);
      if (!entry) return;
      pendingCallbacks.delete(callbackId);
      clearTimeout(entry.timer);
      entry.reject(new Error(message || 'Biometric operation failed'));
    },
  };
}

function getBridge(): AegisAndroidBiometricBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = window.AegisAndroidBiometric;
  if (!bridge) return null;
  if (typeof bridge.wrap !== 'function' || typeof bridge.unwrap !== 'function') return null;
  return bridge;
}

export function isBiometricAndroidBridgeAvailable(): boolean {
  return getBridge() !== null;
}

function callNative(
  operation: 'wrap' | 'unwrap',
  payload: string,
): Promise<string> {
  const bridge = getBridge();
  if (!bridge) {
    return Promise.reject(new Error('Android biometric bridge is unavailable'));
  }
  installReceiver();
  const callbackId = `bio_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      const entry = pendingCallbacks.get(callbackId);
      if (!entry) return;
      pendingCallbacks.delete(callbackId);
      reject(new Error('Biometric operation timed out'));
    }, ANDROID_BIOMETRIC_TIMEOUT_MS);
    pendingCallbacks.set(callbackId, { resolve, reject, timer });
    try {
      if (operation === 'wrap') {
        bridge.wrap(payload, callbackId);
      } else {
        bridge.unwrap(payload, callbackId);
      }
    } catch (error) {
      pendingCallbacks.delete(callbackId);
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Wraps a raw biometric wrapping secret under the auth-bound AndroidKeyStore
 * key and returns an opaque handle to persist. The raw secret never reaches
 * storage or the JS heap beyond this call frame.
 */
export async function wrapAndroidBiometricSecret(plaintext: Uint8Array): Promise<AndroidBiometricHandle> {
  if (!isBiometricAndroidBridgeAvailable()) {
    throw new Error('Android biometric bridge is unavailable');
  }
  const plaintextB64 = bytesToBase64(plaintext);
  return callNative('wrap', plaintextB64);
}

/**
 * Unwraps a persisted opaque handle back to the raw biometric wrapping secret.
 * Triggers a fresh BiometricPrompt + CryptoObject authentication on the device;
 * if the key was invalidated (e.g. biometric enrollment changed) this rejects.
 */
export async function unwrapAndroidBiometricSecret(handle: AndroidBiometricHandle): Promise<Uint8Array> {
  if (!isBiometricAndroidBridgeAvailable()) {
    throw new Error('Android biometric bridge is unavailable');
  }
  const plaintextB64 = await callNative('unwrap', handle);
  return base64ToBytes(plaintextB64);
}

/** Invalidates the auth-bound key so prior wrapped handles become unusable. */
export function clearAndroidBiometricKey(): boolean {
  const bridge = getBridge();
  if (!bridge || typeof bridge.clear !== 'function') return false;
  try {
    return bridge.clear();
  } catch {
    return false;
  }
}

export function isBiometricHandle(value: string): boolean {
  const trimmed = value.trimStart();
  return trimmed.startsWith('{') && trimmed.includes('"v"') && trimmed.includes('"ct"');
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(atob(value).split('').map((char) => char.charCodeAt(0)));
}
