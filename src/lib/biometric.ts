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
import {
  clearAndroidBiometricKey,
  isBiometricAndroidBridgeAvailable,
  isBiometricHandle,
  unwrapAndroidBiometricSecret,
  wrapAndroidBiometricSecret,
} from './biometricAndroid';
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
  /** @deprecated wrappingSecret is no longer stored in the bundle (P0-3 security fix). Retained for migration only. */
  wrappingSecret?: string;
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

    // P0-3: Migrate v3 biometric registrations that still have wrappingSecret embedded
    // in the bundle. Move it to secure storage and strip it from the persisted bundle.
    if (cachedBiometricInfo && cachedBiometricInfo.version === 3 && cachedBiometricInfo.wrappingSecret) {
      const inlineSecret = cachedBiometricInfo.wrappingSecret;
      if (isSecureStorageAvailable()) {
        const existingSecure = getSecureStorageItem(secureStorageKeys.biometricWrappingSecret);
        if (!existingSecure) {
          setSecureStorageItem(secureStorageKeys.biometricWrappingSecret, inlineSecret);
        }
        // Strip wrappingSecret from the persisted bundle
        const migratedInfo: NativeBiometricInfoV3 = { ...cachedBiometricInfo };
        delete migratedInfo.wrappingSecret;
        cachedBiometricInfo = migratedInfo;
        if (!saveBiometricToSecureStorage(migratedInfo)) {
          await saveBiometricToIndexedDB(migratedInfo);
        }
        console.info('[AegisVault Security] Biometric v3 wrappingSecret migrated to secure storage (P0-3).');
      }
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
  if (typeof window === 'undefined' || !(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) {
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
  // RUST-O4: native biometrics are truly hardware-bound only when the
  // auth-bound AndroidKeyStore bridge is available (legacy KeyStore-only
  // secure storage without auth binding does not qualify).
  if (cachedBiometricInfo.version === 3 && isBiometricAndroidBridgeAvailable()) return true;
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
  clearAndroidBiometricKey();
  void deleteBiometricFromIndexedDBWithRetry().catch((err) => {
    console.error('Failed to delete biometric from IndexedDB after retries:', err);
  });
}

export async function disableBiometricAsync(): Promise<void> {
  cachedBiometricInfo = null;
  removeSecureStorageItem(secureStorageKeys.biometricInfo);
  removeSecureStorageItem(secureStorageKeys.biometricWrappingSecret);
  clearAndroidBiometricKey();
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
      } as unknown as Record<string, unknown>,
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

  const credWithExt = credential as PublicKeyCredential & { getClientExtensionResults?: () => Record<string, unknown> };
  const clientExtResults = credWithExt.getClientExtensionResults ? credWithExt.getClientExtensionResults() : null;
  const prfExt = clientExtResults?.prf as { results?: { first?: ArrayBuffer } } | undefined;
  const prfResult = prfExt?.results?.first;
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

  const wrappingSecret = secureRandomBytes(32);

  // RUST-O4: when the auth-bound AndroidKeyStore bridge is available, only the
  // opaque wrapped handle is persisted — the raw secret never reaches storage.
  // The bridge's BiometricPrompt + CryptoObject gate IS the strong user
  // authentication, so a separate native prompt would ask for a redundant
  // second fingerprint scan.
  if (isBiometricAndroidBridgeAvailable()) {
    const handle = await wrapAndroidBiometricSecret(wrappingSecret);
    setSecureStorageItem(secureStorageKeys.biometricWrappingSecret, handle);
  } else {
    await authenticateNativeBiometric();
    setSecureStorageItem(secureStorageKeys.biometricWrappingSecret, bytesToBase64(wrappingSecret));
  }

  const salt = secureRandomBytes(16);
  const wrappingKey = await deriveWebCryptoPbkdf2Key(wrappingSecret, salt, BIOMETRIC_PBKDF2_ITERATIONS, 32);
  const bundle = await webCryptoAesGcmEncrypt(payload, wrappingKey, generateSafeIv());

  const biometricInfo: NativeBiometricInfoV3 = {
    version: 3,
    provider: 'Tauri Native Biometric',
    kdf: 'WebCrypto PBKDF2-SHA256',
    cipher: 'WebCrypto AES-256-GCM',
    // P0-3: wrappingSecret is NOT stored in the bundle anymore — only in OS secure storage
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

/**
 * RUST-O5: Rotates a legacy native biometric wrapping secret (raw base64,
 * encrypted only by the general KeyStore key — not auth-bound) to the
 * hardware-bound AndroidKeyStore opaque handle. Called after a successful
 * legacy unlock has proven the secret is still valid. Best-effort: a rotation
 * failure (e.g. the user cancels the rotation BiometricPrompt) never breaks
 * the unlock — the legacy binding stays usable and rotation is retried on the
 * next unlock. One-time cost: afterwards unlocks use the single-prompt
 * hardware-bound path.
 */
async function rotateLegacyNativeSecretToHardwareBound(wrappingSecret: Uint8Array): Promise<void> {
  try {
    const handle = await wrapAndroidBiometricSecret(wrappingSecret);
    setSecureStorageItem(secureStorageKeys.biometricWrappingSecret, handle);
    console.info('[AegisVault Security] Legacy native biometric wrapping secret rotated to hardware-bound AndroidKeyStore handle (RUST-O5).');
  } catch {
    // Non-fatal: keep the legacy raw secret; retry on the next unlock.
  }
}

async function authenticateBiometricRaw(): Promise<string> {
  const biometricInfo = cachedBiometricInfo;
  if (!biometricInfo) {
    throw new BiometricError(biometricErrorCodes.missingBundle);
  }

  if (biometricInfo.version === 3) {
    try {
      const stored = getSecureStorageItem(secureStorageKeys.biometricWrappingSecret);
      if (!stored) {
        // P0-3: wrappingSecret MUST come from OS secure storage. If unavailable,
        // the biometric binding is broken — force re-registration.
        throw new BiometricError(biometricErrorCodes.integrityMismatch, 'Biometric wrapping secret not found in secure storage. Re-registration required.');
      }
      let wrappingSecret: Uint8Array;
      if (isBiometricAndroidBridgeAvailable() && isBiometricHandle(stored)) {
        // RUST-O4: opaque handle wrapped by the auth-bound AndroidKeyStore key.
        // unwrapAndroidBiometricSecret runs BiometricPrompt + CryptoObject, which
        // IS the strong user authentication — no separate native prompt needed
        // (that would ask for a redundant second fingerprint scan).
        wrappingSecret = await unwrapAndroidBiometricSecret(stored);
      } else {
        // Legacy path: raw KeyStore-encrypted secret without the auth-bound
        // bridge, so an explicit native biometric prompt is still required.
        await authenticateNativeBiometric();
        wrappingSecret = base64ToBytes(stored);
      }
      const saltBytes = base64ToBytes(biometricInfo.salt);
      const iterations = biometricInfo.pbkdf2Iterations ?? BIOMETRIC_PBKDF2_ITERATIONS;
      const wrappingKey = await deriveWebCryptoPbkdf2Key(wrappingSecret, saltBytes, iterations, 32);
      const decrypted = await webCryptoAesGcmDecrypt(biometricInfo.bundle, wrappingKey);
      // RUST-O5: a successful legacy unlock proves the raw secret is still
      // valid — rotate it to the hardware-bound AndroidKeyStore handle so the
      // raw secret stops living in (KeyStore-encrypted) storage.
      if (isBiometricAndroidBridgeAvailable() && !isBiometricHandle(stored)) {
        await rotateLegacyNativeSecretToHardwareBound(wrappingSecret);
      }
      return decrypted;
    } catch (error) {
      if (error instanceof BiometricError) throw error;
      if (error instanceof Error && error.message === 'cancelled') {
        throw new BiometricError(biometricErrorCodes.authenticationCancelled);
      }
      throw new BiometricError(biometricErrorCodes.integrityMismatch);
    }
  }

  const credIdBytes = base64ToBytes(biometricInfo.credentialId);
  const saltBytes = base64ToBytes(biometricInfo.salt);
  const challenge = secureRandomBytes(32);

  const extensions: Record<string, unknown> = {};
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

  const assertionWithExt = assertion as PublicKeyCredential & { getClientExtensionResults?: () => Record<string, unknown> };
  const clientExtResults = assertionWithExt.getClientExtensionResults ? assertionWithExt.getClientExtensionResults() : null;
  const prfExt = clientExtResults?.prf as { results?: { first?: ArrayBuffer } } | undefined;
  const prfResult = prfExt?.results?.first;
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
