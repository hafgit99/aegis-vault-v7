/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { APP_NAME, APP_SHORT_NAME } from './branding';
import {
  getSecureStorageItem,
  removeSecureStorageItem,
  secureStorageKeys,
  setSecureStorageItem,
  isSecureStorageAvailable,
} from './secureStorage';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt, generateSafeIv, type WebCryptoAesGcmPayload } from './webcrypto';

export const BIOMETRIC_PBKDF2_ITERATIONS = 600_000;

export const biometricErrorCodes = {
  unsupported: 'biometric.unsupported',
  registrationCancelled: 'biometric.registrationCancelled',
  missingBundle: 'biometric.missingBundle',
  authenticationCancelled: 'biometric.authenticationCancelled',
  integrityMismatch: 'biometric.integrityMismatch',
} as const;

export type BiometricErrorCode = (typeof biometricErrorCodes)[keyof typeof biometricErrorCodes];

export class BiometricError extends Error {
  constructor(public readonly code: BiometricErrorCode) {
    super(code);
    this.name = 'BiometricError';
  }
}

async function deriveWebCryptoPbkdf2Key(password: Uint8Array, salt: Uint8Array, iterations: number, keyLen: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    keyLen * 8,
  );

  return new Uint8Array(bits);
}

interface BiometricInfoV2 {
  version: 2;
  kdf: 'WebCrypto PBKDF2-SHA256';
  cipher: 'WebCrypto AES-256-GCM';
  credentialId: string;
  salt: string;
  bundle: WebCryptoAesGcmPayload;
  pbkdf2Iterations?: number;
  authenticatorType?: 'platform' | 'cross-platform';
}

interface NativeBiometricInfoV3 {
  version: 3;
  provider: 'Tauri Native Biometric';
  kdf: 'WebCrypto PBKDF2-SHA256';
  cipher: 'WebCrypto AES-256-GCM';
  wrappingSecret: string;
  salt: string;
  bundle: WebCryptoAesGcmPayload;
  pbkdf2Iterations?: number;
}

type BiometricInfo = BiometricInfoV2 | NativeBiometricInfoV3;

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

const BIOMETRIC_DB_NAME = 'aegis_biometric_db';
const BIOMETRIC_STORE_NAME = 'biometric_info';
const BIOMETRIC_DB_VERSION = 1;
const BIOMETRIC_KEY = 'biometric_setup';

function initBiometricDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BIOMETRIC_DB_NAME, BIOMETRIC_DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BIOMETRIC_STORE_NAME)) {
        db.createObjectStore(BIOMETRIC_STORE_NAME);
      }
    };
  });
}

function loadBiometricFromIndexedDB(): Promise<BiometricInfo | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return initBiometricDB().then((db) => {
    return new Promise<BiometricInfo | null>((resolve, reject) => {
      const transaction = db.transaction(BIOMETRIC_STORE_NAME, 'readonly');
      const store = transaction.objectStore(BIOMETRIC_STORE_NAME);
      const request = store.get(BIOMETRIC_KEY);
      request.onsuccess = () => {
        resolve(request.result || null);
        db.close();
      };
      request.onerror = () => {
        reject(request.error);
        db.close();
      };
    });
  });
}

function loadBiometricFromSecureStorage(): BiometricInfo | null {
  const raw = getSecureStorageItem(secureStorageKeys.biometricInfo);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as BiometricInfo;
  } catch {
    removeSecureStorageItem(secureStorageKeys.biometricInfo);
    return null;
  }
}

function saveBiometricToIndexedDB(info: BiometricInfo): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }
  return initBiometricDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(BIOMETRIC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(BIOMETRIC_STORE_NAME);
      const request = store.put(info, BIOMETRIC_KEY);
      transaction.oncomplete = () => {
        resolve();
        db.close();
      };
      transaction.onerror = () => {
        reject(transaction.error);
        db.close();
      };
    });
  });
}

function saveBiometricToSecureStorage(info: BiometricInfo): boolean {
  return setSecureStorageItem(secureStorageKeys.biometricInfo, JSON.stringify(info));
}

function deleteBiometricFromIndexedDB(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve();
  }
  return initBiometricDB().then((db) => {
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(BIOMETRIC_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(BIOMETRIC_STORE_NAME);
      const request = store.delete(BIOMETRIC_KEY);
      transaction.oncomplete = () => {
        resolve();
        db.close();
      };
      transaction.onerror = () => {
        reject(transaction.error);
        db.close();
      };
    });
  });
}

let cachedBiometricInfo: BiometricInfo | null = null;
let isHydrated = false;

export async function hydrateBiometric(): Promise<void> {
  if (isHydrated) return;
  try {
    const secureStorageInfo = loadBiometricFromSecureStorage();
    cachedBiometricInfo = secureStorageInfo ?? await loadBiometricFromIndexedDB();
    if (!secureStorageInfo && cachedBiometricInfo && saveBiometricToSecureStorage(cachedBiometricInfo)) {
      await deleteBiometricFromIndexedDB();
    }
    isHydrated = true;
  } catch (e) {
    console.error('Failed to load biometric config from IndexedDB', e);
  }
}

export function resetBiometricCacheForTesting(): void {
  cachedBiometricInfo = null;
  isHydrated = false;
}

function hasWebAuthnSupport(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials;
}

function isTauriAndroidRuntime(): boolean {
  if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
    return false;
  }

  return /Android/i.test(navigator.userAgent || '');
}

async function loadNativeBiometricApi(): Promise<{
  authenticate: (reason: string, options?: {
    allowDeviceCredential?: boolean;
    title?: string;
    subtitle?: string;
    confirmationRequired?: boolean;
  }) => Promise<void>;
  checkStatus: () => Promise<{ isAvailable: boolean; error?: string; errorCode?: string }>;
} | null> {
  if (!isTauriAndroidRuntime()) {
    return null;
  }

  try {
    return await import('@tauri-apps/plugin-biometric');
  } catch {
    return null;
  }
}

async function isNativeBiometricAvailable(): Promise<boolean> {
  const nativeBiometric = await loadNativeBiometricApi();
  return nativeBiometric !== null;
}

async function authenticateNativeBiometric(): Promise<void> {
  const nativeBiometric = await loadNativeBiometricApi();
  if (!nativeBiometric) {
    throw new BiometricError(biometricErrorCodes.unsupported);
  }

  await nativeBiometric.authenticate('Unlock Aegis Vault', {
    allowDeviceCredential: true,
    title: APP_NAME,
    subtitle: 'Confirm your screen lock to continue',
    confirmationRequired: true,
  });
}

export function isBiometricSupported(): boolean {
  return hasWebAuthnSupport() || isTauriAndroidRuntime();
}

export function isBiometricEnabled(): boolean {
  return cachedBiometricInfo !== null;
}

export function getBiometricType(): 'platform' | 'cross-platform' | 'native' | null {
  if (!cachedBiometricInfo) return null;
  if (cachedBiometricInfo.version === 3) return 'native';
  return cachedBiometricInfo.authenticatorType ?? 'platform';
}

export function disableBiometric(): void {
  cachedBiometricInfo = null;
  removeSecureStorageItem(secureStorageKeys.biometricInfo);
  void deleteBiometricFromIndexedDB();
}

export async function registerBiometric(masterPassword: string, type: 'platform' | 'cross-platform' = 'platform'): Promise<void> {
  if (hasWebAuthnSupport()) {
    await registerWebAuthnBiometric(masterPassword, type);
    return;
  }

  if (await isNativeBiometricAvailable()) {
    await registerNativeBiometric(masterPassword);
    return;
  }

  throw new BiometricError(biometricErrorCodes.unsupported);
}

async function registerWebAuthnBiometric(masterPassword: string, type: 'platform' | 'cross-platform'): Promise<void> {
  if (!hasWebAuthnSupport()) {
    throw new BiometricError(biometricErrorCodes.unsupported);
  }

  // Create a randomized challenge
  const challenge = secureRandomBytes(32);

  // Create a randomized userId
  const userId = secureRandomBytes(16);

  const creationOptions: CredentialCreationOptions = {
    publicKey: {
      challenge: challenge,
      rp: {
        name: APP_NAME,
      },
      user: {
        id: userId,
        name: "aegis_user_" + Date.now(),
        displayName: `${APP_SHORT_NAME} User`,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: type,
        userVerification: "required",
      },
      timeout: 60000,
    }
  };

  const credential = await navigator.credentials.create(creationOptions) as PublicKeyCredential;
  if (!credential) {
    throw new BiometricError(biometricErrorCodes.registrationCancelled);
  }

  // Use rawId to derive the secure AES-256 wrapping key
  const rawIdBytes = new Uint8Array(credential.rawId);
  
  // Clean generated 16-byte random salt for PBKDF2-SHA256
  const salt = secureRandomBytes(16);

  const wrappingKey = await deriveWebCryptoPbkdf2Key(rawIdBytes, salt, BIOMETRIC_PBKDF2_ITERATIONS, 32);

  const bundle = await webCryptoAesGcmEncrypt(masterPassword, wrappingKey, generateSafeIv());

  const biometricInfo: BiometricInfoV2 = {
    version: 2,
    kdf: 'WebCrypto PBKDF2-SHA256',
    cipher: 'WebCrypto AES-256-GCM',
    credentialId: bytesToBase64(new Uint8Array(credential.rawId)),
    salt: bytesToBase64(salt),
    bundle: bundle,
    pbkdf2Iterations: BIOMETRIC_PBKDF2_ITERATIONS,
    authenticatorType: type,
  };

  cachedBiometricInfo = biometricInfo;
  if (!saveBiometricToSecureStorage(biometricInfo)) {
    await saveBiometricToIndexedDB(biometricInfo);
  } else {
    await deleteBiometricFromIndexedDB();
  }
}

async function registerNativeBiometric(masterPassword: string): Promise<void> {
  if (!isSecureStorageAvailable()) {
    throw new BiometricError(biometricErrorCodes.unsupported);
  }

  await authenticateNativeBiometric();

  const wrappingSecret = secureRandomBytes(32);
  const salt = secureRandomBytes(16);
  const wrappingKey = await deriveWebCryptoPbkdf2Key(wrappingSecret, salt, BIOMETRIC_PBKDF2_ITERATIONS, 32);
  const bundle = await webCryptoAesGcmEncrypt(masterPassword, wrappingKey, generateSafeIv());

  const biometricInfo: NativeBiometricInfoV3 = {
    version: 3,
    provider: 'Tauri Native Biometric',
    kdf: 'WebCrypto PBKDF2-SHA256',
    cipher: 'WebCrypto AES-256-GCM',
    wrappingSecret: bytesToBase64(wrappingSecret),
    salt: bytesToBase64(salt),
    bundle,
    pbkdf2Iterations: BIOMETRIC_PBKDF2_ITERATIONS,
  };

  if (!saveBiometricToSecureStorage(biometricInfo)) {
    throw new BiometricError(biometricErrorCodes.unsupported);
  }
  cachedBiometricInfo = biometricInfo;
  await deleteBiometricFromIndexedDB();
}

export async function authenticateBiometric(): Promise<string> {
  const biometricInfo = cachedBiometricInfo;
  if (!biometricInfo) {
    throw new BiometricError(biometricErrorCodes.missingBundle);
  }

  if (biometricInfo.version === 3) {
    await authenticateNativeBiometric();

    try {
      const wrappingSecret = base64ToBytes(biometricInfo.wrappingSecret);
      const saltBytes = base64ToBytes(biometricInfo.salt);
      const iterations = biometricInfo.pbkdf2Iterations ?? BIOMETRIC_PBKDF2_ITERATIONS;
      const wrappingKey = await deriveWebCryptoPbkdf2Key(wrappingSecret, saltBytes, iterations, 32);
      return webCryptoAesGcmDecrypt(biometricInfo.bundle, wrappingKey);
    } catch {
      throw new BiometricError(biometricErrorCodes.integrityMismatch);
    }
  }

  const credIdBytes = base64ToBytes(biometricInfo.credentialId);
  const saltBytes = base64ToBytes(biometricInfo.salt);

  const challenge = secureRandomBytes(32);

  const requestOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: challenge,
      allowCredentials: [
        {
          id: credIdBytes,
          type: "public-key",
        }
      ],
      userVerification: "required",
      timeout: 60000,
    }
  };

  const assertion = await navigator.credentials.get(requestOptions) as PublicKeyCredential;
  if (!assertion) {
    throw new BiometricError(biometricErrorCodes.authenticationCancelled);
  }

  const rawIdBytes = new Uint8Array(assertion.rawId);

  try {
    if (biometricInfo.version === 2 && biometricInfo.cipher === 'WebCrypto AES-256-GCM') {
      const iterations = biometricInfo.pbkdf2Iterations ?? BIOMETRIC_PBKDF2_ITERATIONS;
      const wrappingKey = await deriveWebCryptoPbkdf2Key(rawIdBytes, saltBytes, iterations, 32);
      return webCryptoAesGcmDecrypt(biometricInfo.bundle, wrappingKey);
    }

    throw new BiometricError(biometricErrorCodes.integrityMismatch);
  } catch (e) {
    throw new BiometricError(biometricErrorCodes.integrityMismatch);
  }
}
