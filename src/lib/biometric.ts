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
  constructor(public readonly code: BiometricErrorCode, message?: string) {
    super(message || code);
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

export interface BiometricInfoV4 {
  version: 4;
  kdf: 'WebCrypto PBKDF2-SHA256' | 'WebAuthn PRF + PBKDF2-SHA256';
  cipher: 'WebCrypto AES-256-GCM';
  credentialId: string;
  salt: string;
  prfSalt?: string;
  prfSupported: boolean;
  bundle: WebCryptoAesGcmPayload;
  pbkdf2Iterations?: number;
  authenticatorType?: 'platform' | 'cross-platform';
}

type BiometricInfo = BiometricInfoV2 | NativeBiometricInfoV3 | BiometricInfoV4;

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
      store.put(info, BIOMETRIC_KEY);
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
      store.delete(BIOMETRIC_KEY);
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
export let biometricV2UpgradeRequired = false;
let isHydrated = false;

export async function hydrateBiometric(): Promise<void> {
  if (isHydrated) return;
  try {
    const secureStorageInfo = loadBiometricFromSecureStorage();
    cachedBiometricInfo = secureStorageInfo ?? await loadBiometricFromIndexedDB();
    if (!secureStorageInfo && cachedBiometricInfo && saveBiometricToSecureStorage(cachedBiometricInfo)) {
      await deleteBiometricFromIndexedDB();
    }

    // Security fix Y6: Detect and remove insecure v2 biometric registrations.
    // v2 uses the public credentialId (rawId) as wrapping key material without PRF.
    // Anyone with access to IndexedDB/secure storage can reconstruct the wrapping key
    // from credentialId + salt + bundle + iterations without biometric authentication.
    if (cachedBiometricInfo && cachedBiometricInfo.version === 2) {
      console.warn('[AegisVault Security] Insecure biometric v2 registration detected. Removing and requiring re-registration.');
      disableBiometric();
      biometricV2UpgradeRequired = true;
    }

    isHydrated = true;
  } catch (e) {
    console.error('Failed to load biometric config from IndexedDB', e);
  }
}

export function isBiometricV2UpgradeRequired(): boolean {
  return biometricV2UpgradeRequired;
}

export function dismissBiometricV2UpgradeNotification(): void {
  biometricV2UpgradeRequired = false;
}

export function resetBiometricCacheForTesting(): void {
  cachedBiometricInfo = null;
  biometricV2UpgradeRequired = false;
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
  if (isTauriAndroidRuntime() && !isSecureStorageAvailable()) {
    return false;
  }
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

export function isBiometricHardwareBound(): boolean {
  if (!cachedBiometricInfo) return false;
  if (cachedBiometricInfo.version === 4 && cachedBiometricInfo.prfSupported) return true;
  if (cachedBiometricInfo.version === 3 && isSecureStorageAvailable()) return true;
  return false;
}

async function deleteBiometricFromIndexedDBWithRetry(retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await deleteBiometricFromIndexedDB();
      return;
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 50 * attempt));
    }
  }
}

export function disableBiometric(): void {
  cachedBiometricInfo = null;
  removeSecureStorageItem(secureStorageKeys.biometricInfo);
  removeSecureStorageItem(secureStorageKeys.biometricWrappingSecret);
  void deleteBiometricFromIndexedDBWithRetry().catch((err) => {
    console.error('Failed to delete biometric from IndexedDB after retries:', err);
  });
}

export async function disableBiometricAsync(): Promise<void> {
  cachedBiometricInfo = null;
  removeSecureStorageItem(secureStorageKeys.biometricInfo);
  removeSecureStorageItem(secureStorageKeys.biometricWrappingSecret);
  await deleteBiometricFromIndexedDBWithRetry();
}

export interface BiometricCredentialsPayload {
  masterPassword: string;
  secretKey?: string | null;
}

export type BiometricRegistrationInput = string | BiometricCredentialsPayload;

function serializeBiometricPayload(input: BiometricRegistrationInput): string {
  if (typeof input === 'string') {
    return input;
  }
  return JSON.stringify({
    masterPassword: input.masterPassword,
    secretKey: input.secretKey || null,
  });
}

function parseBiometricPayload(decryptedRaw: string): BiometricCredentialsPayload {
  try {
    if (decryptedRaw.startsWith('{')) {
      const parsed = JSON.parse(decryptedRaw);
      if (parsed && typeof parsed.masterPassword === 'string') {
        return {
          masterPassword: parsed.masterPassword,
          secretKey: parsed.secretKey || null,
        };
      }
    } else if (decryptedRaw.startsWith('aegis-vault-v7:')) {
      const sepIdx = decryptedRaw.indexOf('\0');
      if (sepIdx !== -1) {
        return {
          masterPassword: decryptedRaw.substring('aegis-vault-v7:'.length, sepIdx),
          secretKey: decryptedRaw.substring(sepIdx + 1),
        };
      }
    }
  } catch {
    // Ignore parse errors, fallback to raw string
  }
  return {
    masterPassword: decryptedRaw,
    secretKey: null,
  };
}

export async function registerBiometric(
  input: BiometricRegistrationInput,
  type: 'platform' | 'cross-platform' = 'platform',
): Promise<void> {
  if (isTauriAndroidRuntime() && !isSecureStorageAvailable()) {
    throw new BiometricError(biometricErrorCodes.unsupported);
  }

  const payload = serializeBiometricPayload(input);

  if (hasWebAuthnSupport()) {
    await registerWebAuthnBiometric(payload, type);
    return;
  }

  if (await isNativeBiometricAvailable()) {
    await registerNativeBiometric(payload);
    return;
  }

  throw new BiometricError(biometricErrorCodes.unsupported);
}

async function registerWebAuthnBiometric(payload: string, type: 'platform' | 'cross-platform'): Promise<void> {
  const challenge = secureRandomBytes(32);
  const prfSalt = secureRandomBytes(32);
  const salt = secureRandomBytes(16);
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
      extensions: {
        prf: {
          eval: {
            first: prfSalt.buffer,
          },
        },
      } as any,
      timeout: 60000,
    }
  };

  const credential = await navigator.credentials.create(creationOptions) as PublicKeyCredential;
  if (!credential) {
    throw new BiometricError(biometricErrorCodes.registrationCancelled);
  }

  const rawIdBytes = new Uint8Array(credential.rawId);
  let keyMaterial: Uint8Array = rawIdBytes;
  let prfSupported = false;

  const clientExtResults = (credential as any).getClientExtensionResults ? (credential as any).getClientExtensionResults() : null;
  const prfResult = clientExtResults?.prf?.results?.first;
  if (!prfResult) {
    throw new BiometricError(
      biometricErrorCodes.unsupported,
      'WebAuthn PRF (pseudo-random function) extension is required for biometric authentication.',
    );
  }

  const prfSecret = new Uint8Array(prfResult);
  keyMaterial = new Uint8Array(prfSecret.length + rawIdBytes.length);
  keyMaterial.set(prfSecret);
  keyMaterial.set(rawIdBytes, prfSecret.length);
  prfSupported = true;

  const wrappingKey = await deriveWebCryptoPbkdf2Key(keyMaterial, salt, BIOMETRIC_PBKDF2_ITERATIONS, 32);
  const bundle = await webCryptoAesGcmEncrypt(payload, wrappingKey, generateSafeIv());

  const biometricInfo: BiometricInfoV4 = {
    version: 4,
    kdf: prfSupported ? 'WebAuthn PRF + PBKDF2-SHA256' : 'WebCrypto PBKDF2-SHA256',
    cipher: 'WebCrypto AES-256-GCM',
    credentialId: bytesToBase64(new Uint8Array(credential.rawId)),
    salt: bytesToBase64(salt),
    prfSalt: bytesToBase64(prfSalt),
    prfSupported,
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

async function registerNativeBiometric(payload: string): Promise<void> {
  if (!isSecureStorageAvailable()) {
    throw new BiometricError(biometricErrorCodes.unsupported);
  }

  await authenticateNativeBiometric();

  const wrappingSecret = secureRandomBytes(32);
  const wrappingSecretB64 = bytesToBase64(wrappingSecret);
  setSecureStorageItem(secureStorageKeys.biometricWrappingSecret, wrappingSecretB64);

  const salt = secureRandomBytes(16);
  const wrappingKey = await deriveWebCryptoPbkdf2Key(wrappingSecret, salt, BIOMETRIC_PBKDF2_ITERATIONS, 32);
  const bundle = await webCryptoAesGcmEncrypt(payload, wrappingKey, generateSafeIv());

  const biometricInfo: NativeBiometricInfoV3 = {
    version: 3,
    provider: 'Tauri Native Biometric',
    kdf: 'WebCrypto PBKDF2-SHA256',
    cipher: 'WebCrypto AES-256-GCM',
    wrappingSecret: wrappingSecretB64,
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

async function authenticateBiometricRaw(): Promise<string> {
  const biometricInfo = cachedBiometricInfo;
  if (!biometricInfo) {
    throw new BiometricError(biometricErrorCodes.missingBundle);
  }

  if (biometricInfo.version === 3) {
    await authenticateNativeBiometric();

    try {
      const storedWrappingSecret = getSecureStorageItem(secureStorageKeys.biometricWrappingSecret) || biometricInfo.wrappingSecret;
      const wrappingSecret = base64ToBytes(storedWrappingSecret);
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

  const extensions: any = {};
  if ('prfSalt' in biometricInfo && biometricInfo.prfSalt) {
    extensions.prf = {
      eval: {
        first: base64ToBytes(biometricInfo.prfSalt).buffer,
      },
    };
  }

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
      extensions: Object.keys(extensions).length > 0 ? extensions : undefined,
      timeout: 60000,
    }
  };

  const assertion = await navigator.credentials.get(requestOptions) as PublicKeyCredential;
  if (!assertion) {
    throw new BiometricError(biometricErrorCodes.authenticationCancelled);
  }

  const rawIdBytes = new Uint8Array(assertion.rawId);
  let keyMaterial: Uint8Array = rawIdBytes;

  const clientExtResults = (assertion as any).getClientExtensionResults ? (assertion as any).getClientExtensionResults() : null;
  const prfResult = clientExtResults?.prf?.results?.first;
  if (prfResult) {
    const prfSecret = new Uint8Array(prfResult);
    keyMaterial = new Uint8Array(prfSecret.length + rawIdBytes.length);
    keyMaterial.set(prfSecret);
    keyMaterial.set(rawIdBytes, prfSecret.length);
  }

  try {
    if ((biometricInfo.version === 2 || biometricInfo.version === 4) && biometricInfo.cipher === 'WebCrypto AES-256-GCM') {
      const iterations = biometricInfo.pbkdf2Iterations ?? BIOMETRIC_PBKDF2_ITERATIONS;
      const wrappingKey = await deriveWebCryptoPbkdf2Key(keyMaterial, saltBytes, iterations, 32);
      return webCryptoAesGcmDecrypt(biometricInfo.bundle, wrappingKey);
    }

    throw new BiometricError(biometricErrorCodes.integrityMismatch);
  } catch (_e) {
    throw new BiometricError(biometricErrorCodes.integrityMismatch);
  }
}

export async function authenticateBiometricCredentials(): Promise<BiometricCredentialsPayload> {
  const decryptedRaw = await authenticateBiometricRaw();
  return parseBiometricPayload(decryptedRaw);
}

export async function authenticateBiometric(): Promise<string> {
  const { masterPassword } = await authenticateBiometricCredentials();
  return masterPassword;
}

const BIOMETRIC_AUTOFILL_REQUIRE_KEY = 'aegis_biometric_autofill_require';

export function isBiometricAutofillRequireEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(BIOMETRIC_AUTOFILL_REQUIRE_KEY) === 'true';
}

export function setBiometricAutofillRequireEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  if (enabled) {
    localStorage.setItem(BIOMETRIC_AUTOFILL_REQUIRE_KEY, 'true');
  } else {
    localStorage.removeItem(BIOMETRIC_AUTOFILL_REQUIRE_KEY);
  }
}
