/**
 * @vitest-environment jsdom
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeAuthenticate = vi.hoisted(() => vi.fn(async () => undefined));
const nativeCheckStatus = vi.hoisted(() => vi.fn(async () => ({ isAvailable: true })));

vi.mock('@tauri-apps/plugin-biometric', () => ({
  authenticate: nativeAuthenticate,
  checkStatus: nativeCheckStatus,
}));

import {
  authenticateBiometric,
  authenticateBiometricCredentials,
  BIOMETRIC_PBKDF2_ITERATIONS,
  BiometricError,
  biometricErrorCodes,
  disableBiometric,
  isBiometricEnabled,
  isBiometricHardwareBound,
  isBiometricSupported,
  registerBiometric,
  hydrateBiometric,
  resetBiometricCacheForTesting,
  getBiometricType,
  isBiometricAutofillRequireEnabled,
  setBiometricAutofillRequireEnabled,
} from './biometric';
import { webCryptoAesGcmEncrypt, generateSafeIv } from './webcrypto';

const rawId = new Uint8Array([1, 2, 3, 4]).buffer;
const encoder = new TextEncoder();
function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function getStoredBiometricFromDB(): Promise<any> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('aegis_biometric_db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const info = await new Promise<any>((resolve, reject) => {
    const transaction = db.transaction('biometric_info', 'readonly');
    const request = transaction.objectStore('biometric_info').get('biometric_setup');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return info;
}

async function putStoredBiometricIntoDB(info: any): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('aegis_biometric_db', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('biometric_info');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('biometric_info', 'readwrite');
    transaction.objectStore('biometric_info').put(info, 'biometric_setup');
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function deleteBiometricDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('aegis_biometric_db');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

const defaultPrfResult = {
  getClientExtensionResults: () => ({
    prf: { results: { first: new Uint8Array(32).buffer } },
  }),
};

function mockWebAuthn({
  createCredential = { rawId, ...defaultPrfResult },
  getCredential = { rawId, ...defaultPrfResult },
}: {
  createCredential?: any;
  getCredential?: any;
} = {}) {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  });

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: vi.fn(async () => createCredential),
      get: vi.fn(async () => getCredential),
    },
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  await deleteBiometricDatabase();
  resetBiometricCacheForTesting();
  mockWebAuthn();
  await hydrateBiometric();
});

afterEach(async () => {
  localStorage.clear();
  delete window.AegisAndroidSecureStorage;
  delete (window as any).AegisAndroidBiometric;
  delete window.__TAURI_INTERNALS__;
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: originalUserAgent });
  await deleteBiometricDatabase();
  resetBiometricCacheForTesting();
  vi.restoreAllMocks();
});

const originalUserAgent = navigator.userAgent;

/**
 * Simulates the FIXED native Android bridge contract (RUST-O4 follow-up):
 *  - wrap(plaintextB64)  -> opaque JSON handle {"v":2,"iv":...,"ct":...}
 *  - unwrap(handleJson)  -> PLAIN base64 plaintext (no JSON envelope)
 * The fake "cipher" simply roundtrips the ct field, mirroring the native
 * decrypt result format without requiring real AndroidKeyStore crypto.
 */
function installAndroidBridgeMock(opts?: { unwrapError?: string; wrapError?: string }) {
  const storageMap = new Map<string, string>();
  (window as any).AegisAndroidSecureStorage = {
    isBiometricAvailable: vi.fn(() => true),
    authenticateBiometric: vi.fn(() => true),
    setItem: vi.fn((key: string, val: string) => { storageMap.set(key, val); return true; }),
    getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
    removeItem: vi.fn((key: string) => { storageMap.delete(key); }),
  };

  const wrap = vi.fn((plaintextB64: string, callbackId: string) => {
    setTimeout(() => {
      if (opts?.wrapError) {
        window.__aegisBiometric!.reject(callbackId, opts.wrapError);
        return;
      }
      window.__aegisBiometric!.resolve(callbackId, JSON.stringify({ v: 2, iv: 'aXY=', ct: plaintextB64 }));
    }, 0);
  });
  const unwrap = vi.fn((handleJson: string, callbackId: string) => {
    setTimeout(() => {
      if (opts?.unwrapError) {
        window.__aegisBiometric!.reject(callbackId, opts.unwrapError);
        return;
      }
      const handle = JSON.parse(handleJson);
      window.__aegisBiometric!.resolve(callbackId, handle.ct);
    }, 0);
  });

  (window as any).AegisAndroidBiometric = { wrap, unwrap, isAvailable: () => true, clear: () => true };
  return { storageMap, wrap, unwrap };
}

function mockTauriAndroidRuntime(): void {
  (window as any).__TAURI_INTERNALS__ = {};
  Object.defineProperty(navigator, 'userAgent', {
    configurable: true,
    value: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  });
  // Force the native (non-WebAuthn) path.
  Object.defineProperty(window, 'PublicKeyCredential', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'credentials', { configurable: true, value: undefined });
}

describe('biometric master password wrapper', () => {

  it('reports support and disabled state before setup', () => {
    expect(isBiometricSupported()).toBe(true);
    expect(isBiometricEnabled()).toBe(false);
  });

  it('rejects registration when WebAuthn support is missing', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });

    expect(isBiometricSupported()).toBe(false);
    await expect(registerBiometric('master-pass')).rejects.toMatchObject({
      code: biometricErrorCodes.unsupported,
      name: 'BiometricError',
    });
  });

  it('stores new biometric bundles with WebCrypto metadata', async () => {
    await registerBiometric('master-pass');

    const stored = await getStoredBiometricFromDB();
    const create = vi.mocked(navigator.credentials.create);
    const creationOptions = create.mock.calls[0]![0] as CredentialCreationOptions;

    expect(isBiometricEnabled()).toBe(true);
    expect(stored).toMatchObject({
      version: 4,
      kdf: 'WebAuthn PRF + PBKDF2-SHA256',
      cipher: 'WebCrypto AES-256-GCM',
    });
    expect(stored.bundle).toEqual(
      expect.objectContaining({
        iv: expect.any(String),
        tag: expect.any(String),
        ciphertext: expect.any(String),
      }),
    );
    expect(stored.bundle.ciphertext).not.toContain('master-pass');
    expect(stored.credentialId).toBe(bytesToBase64(new Uint8Array(rawId)));
    expect(stored.pbkdf2Iterations).toBe(BIOMETRIC_PBKDF2_ITERATIONS);
    expect(creationOptions.publicKey).toMatchObject({
      rp: { name: 'Aegis Vault 7' },
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
      },
      timeout: 60000,
    });
    expect(creationOptions.publicKey?.user.displayName).toBe('Aegis Vault User');
  });

  it('can disable a stored biometric bundle', async () => {
    await registerBiometric('master-pass');

    disableBiometric();

    expect(isBiometricEnabled()).toBe(false);
  });

  it('rejects registration when the authenticator create flow is cancelled', async () => {
    mockWebAuthn({ createCredential: null });

    await expect(registerBiometric('master-pass')).rejects.toMatchObject({
      code: biometricErrorCodes.registrationCancelled,
      name: 'BiometricError',
    });
    expect(isBiometricEnabled()).toBe(false);
  });

  it('authenticates and unwraps the master password through WebCrypto AES-GCM', async () => {
    await registerBiometric('master-pass');

    await expect(authenticateBiometric()).resolves.toBe('master-pass');

    const get = vi.mocked(navigator.credentials.get);
    const requestOptions = get.mock.calls[0]![0] as CredentialRequestOptions;
    expect(requestOptions.publicKey).toMatchObject({
      allowCredentials: [
        {
          id: new Uint8Array(rawId),
          type: 'public-key',
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    });
  });

  it('rejects authentication when no biometric bundle is stored', async () => {
    await expect(authenticateBiometric()).rejects.toMatchObject({
      code: biometricErrorCodes.missingBundle,
      name: 'BiometricError',
    });
  });

  it('rejects authentication when the authenticator get flow is cancelled', async () => {
    await registerBiometric('master-pass');
    mockWebAuthn({ getCredential: null });

    await expect(authenticateBiometric()).rejects.toMatchObject({
      code: biometricErrorCodes.authenticationCancelled,
      name: 'BiometricError',
    });
  });

  it('exposes stable biometric error codes for localization boundaries', () => {
    const error = new BiometricError(biometricErrorCodes.integrityMismatch);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(biometricErrorCodes.integrityMismatch);
    expect(error.code).toBe(biometricErrorCodes.integrityMismatch);
  });

  it('rejects biometric unwrap when the authenticator raw id changes', async () => {
    await registerBiometric('master-pass');
    mockWebAuthn({ getCredential: { rawId: new Uint8Array([9, 9, 9, 9]).buffer } });

    await expect(authenticateBiometric()).rejects.toThrow();
  });

  it('rejects removed legacy biometric bundles', async () => {
    await putStoredBiometricIntoDB({
      version: 1,
      credentialId: bytesToBase64(new Uint8Array(rawId)),
      salt: bytesToBase64(new Uint8Array([5, 6, 7, 8])),
      bundle: {
        iv: '000000000000000000000000',
        tag: '00000000000000000000000000000000',
        ciphertext: bytesToBase64(encoder.encode('legacy-master-pass')),
      },
    });
    await hydrateBiometric();

    await expect(authenticateBiometric()).rejects.toThrow();
  });

  it('requires secure storage for Android native biometric registration', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });
    window.__TAURI_INTERNALS__ = {};

    expect(isBiometricSupported()).toBe(false);
    await expect(registerBiometric('master-pass')).rejects.toMatchObject({
      code: biometricErrorCodes.unsupported,
      name: 'BiometricError',
    });

    expect(nativeAuthenticate).not.toHaveBeenCalled();
    expect(await getStoredBiometricFromDB()).toBeNull();
    expect(isBiometricEnabled()).toBe(false);
  });

  it('stores Android native biometric bundles only through secure storage', async () => {
    const secureValues = new Map<string, string>();
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });
    window.__TAURI_INTERNALS__ = {};
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };

    await registerBiometric('master-pass');

    expect(nativeAuthenticate).toHaveBeenCalledTimes(1);
    expect(window.AegisAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'aegis_biometric_wrapping_secret',
      expect.any(String),
    );
    expect(await getStoredBiometricFromDB()).toBeNull();
    const storedInfo = JSON.parse(secureValues.get('aegis_biometric_info') ?? '{}');
    expect(storedInfo).toMatchObject({
      version: 3,
      provider: 'Tauri Native Biometric',
      pbkdf2Iterations: BIOMETRIC_PBKDF2_ITERATIONS,
    });
    // wrappingSecret must NOT be present in the bundle
    expect(storedInfo.wrappingSecret).toBeUndefined();
    expect(secureValues.get('aegis_biometric_wrapping_secret')).toBeDefined();
    expect(isBiometricEnabled()).toBe(true);
  });

  it('does not fall back to IndexedDB when Android secure storage rejects native biometric metadata', async () => {
    Object.defineProperty(window, 'PublicKeyCredential', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });
    window.__TAURI_INTERNALS__ = {};
    window.AegisAndroidSecureStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => false),
      removeItem: vi.fn(() => false),
    };

    await expect(registerBiometric('master-pass')).rejects.toMatchObject({
      code: biometricErrorCodes.unsupported,
      name: 'BiometricError',
    });

    expect(nativeAuthenticate).toHaveBeenCalledTimes(1);
    expect(await getStoredBiometricFromDB()).toBeNull();
    expect(isBiometricEnabled()).toBe(false);
  });

  it('correctly returns the biometric type', async () => {
    expect(getBiometricType()).toBeNull();

    await registerBiometric('master-pass', 'platform');
    expect(getBiometricType()).toBe('platform');

    disableBiometric();
    expect(getBiometricType()).toBeNull();

    await registerBiometric('master-pass', 'cross-platform');
    expect(getBiometricType()).toBe('cross-platform');
  });

  it('correctly assesses hardware-bound status for WebAuthn PRF and native secure storage', async () => {
    expect(isBiometricHardwareBound()).toBe(false);

    await registerBiometric('master-pass', 'platform');
    const stored = await getStoredBiometricFromDB();
    expect(stored.version).toBe(4);

    const prfSecret = new Uint8Array(32).fill(42).buffer;
    mockWebAuthn({
      createCredential: {
        rawId,
        getClientExtensionResults: () => ({ prf: { results: { first: prfSecret } } }),
      } as any,
      getCredential: {
        rawId,
        getClientExtensionResults: () => ({ prf: { results: { first: prfSecret } } }),
      } as any,
    });

    await registerBiometric('master-pass-prf', 'platform');
    const storedPrf = await getStoredBiometricFromDB();
    expect(storedPrf.version).toBe(4);
    expect(storedPrf.prfSupported).toBe(true);
    expect(isBiometricHardwareBound()).toBe(true);

    await expect(authenticateBiometric()).resolves.toBe('master-pass-prf');
  });

  it('registers and recovers master password with secret key envelope', async () => {
    const prfSecret = new Uint8Array(32).fill(77).buffer;
    mockWebAuthn({
      createCredential: {
        rawId,
        getClientExtensionResults: () => ({ prf: { results: { first: prfSecret } } }),
      } as any,
      getCredential: {
        rawId,
        getClientExtensionResults: () => ({ prf: { results: { first: prfSecret } } }),
      } as any,
    });

    await registerBiometric({
      masterPassword: 'my-super-secret-master-password',
      secretKey: 'A3-1234-5678-9012-3456-7890-1234-5678-9012',
    }, 'platform');

    const creds = await authenticateBiometricCredentials();
    expect(creds.masterPassword).toBe('my-super-secret-master-password');
    expect(creds.secretKey).toBe('A3-1234-5678-9012-3456-7890-1234-5678-9012');

    // Also verify backward compatible authenticateBiometric() returns master password
    await expect(authenticateBiometric()).resolves.toBe('my-super-secret-master-password');
  });

  it('manages biometric autofill requirement setting state', () => {
    expect(isBiometricAutofillRequireEnabled()).toBe(false);

    setBiometricAutofillRequireEnabled(true);
    expect(isBiometricAutofillRequireEnabled()).toBe(true);

    setBiometricAutofillRequireEnabled(false);
    expect(isBiometricAutofillRequireEnabled()).toBe(false);
  });

  it('registers and authenticates native biometrics (version 3)', async () => {
    const storageMap = new Map<string, string>();
    (window as any).AegisAndroidSecureStorage = {
      isBiometricAvailable: vi.fn(() => true),
      authenticateBiometric: vi.fn(() => true),
      setItem: vi.fn((key, val) => { storageMap.set(key, val); return true; }),
      getItem: vi.fn((key) => storageMap.get(key) || null),
      removeItem: vi.fn((key) => storageMap.delete(key)),
    };

    await registerBiometric('native-pass', 'platform');

    const creds = await authenticateBiometricCredentials();
    expect(creds.masterPassword).toBe('native-pass');
  });

  it('throws integrityMismatch when biometric bundle is corrupted', async () => {
    disableBiometric();
    (window as any).AegisAndroidSecureStorage = {
      isBiometricAvailable: vi.fn(() => true),
      authenticateBiometric: vi.fn(() => true),
      setItem: vi.fn(),
      getItem: vi.fn((key) => {
        if (key === 'aegis_biometric_info') {
          return JSON.stringify({
            version: 3,
            provider: 'Tauri Native Biometric',
            wrappingSecret: 'c2VjcmV0',
            salt: 'c2FsdA==',
            bundle: 'corrupted-data',
            pbkdf2Iterations: 1000,
          });
        }
        return 'c2VjcmV0';
      }),
      removeItem: vi.fn(),
    };

    await expect(authenticateBiometricCredentials()).rejects.toMatchObject({
      code: biometricErrorCodes.missingBundle,
    });
  });

  it('android bridge: registers with a single biometric prompt and unlocks via the opaque handle', async () => {
    mockTauriAndroidRuntime();
    const { storageMap, wrap, unwrap } = installAndroidBridgeMock();

    await registerBiometric('android-pass', 'platform');

    // The bridge's BiometricPrompt + CryptoObject IS the authentication — the
    // separate tauri-plugin-biometric prompt must NOT fire (no double scan).
    expect(nativeAuthenticate).not.toHaveBeenCalled();
    expect(wrap).toHaveBeenCalledTimes(1);

    const storedHandle = storageMap.get('aegis_biometric_wrapping_secret');
    expect(storedHandle).toBeDefined();
    expect(JSON.parse(storedHandle!)).toMatchObject({ v: 2, iv: expect.any(String), ct: expect.any(String) });

    await expect(authenticateBiometric()).resolves.toBe('android-pass');
    expect(unwrap).toHaveBeenCalledTimes(1);
    expect(JSON.parse(unwrap.mock.calls[0]![0])).toMatchObject({ v: 2 });
  });

  it('android bridge: maps a cancelled unwrap to authenticationCancelled (not integrityMismatch)', async () => {
    mockTauriAndroidRuntime();
    installAndroidBridgeMock({ unwrapError: 'cancelled' });

    await registerBiometric('android-pass', 'platform');

    await expect(authenticateBiometric()).rejects.toMatchObject({
      code: biometricErrorCodes.authenticationCancelled,
      name: 'BiometricError',
    });
  });

  it('android bridge: an unwrap failure surfaces as integrityMismatch (fail-closed)', async () => {
    mockTauriAndroidRuntime();
    installAndroidBridgeMock({ unwrapError: 'Biometric failed: Key invalidated' });

    await registerBiometric('android-pass', 'platform');

    await expect(authenticateBiometric()).rejects.toMatchObject({
      code: biometricErrorCodes.integrityMismatch,
      name: 'BiometricError',
    });
  });

  it('android bridge: rotates a legacy raw secret to the hardware-bound handle after a successful unlock (RUST-O5)', async () => {
    mockTauriAndroidRuntime();
    const { storageMap, wrap, unwrap } = installAndroidBridgeMock();

    // Seed a legacy (pre-RUST-O4) v3 registration: raw base64 wrapping secret
    // under the general (non-auth-bound) secure-storage key.
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrappingKey = await derivePbkdf2KeyForTest(secret, salt, 1000);
    const bundle = await webCryptoAesGcmEncrypt('legacy-pass', wrappingKey, generateSafeIv());
    storageMap.set('aegis_biometric_info', JSON.stringify({
      version: 3,
      provider: 'Tauri Native Biometric',
      kdf: 'WebCrypto PBKDF2-SHA256',
      cipher: 'WebCrypto AES-256-GCM',
      salt: bytesToBase64(salt),
      bundle,
      pbkdf2Iterations: 1000,
    }));
    const legacyRawSecret = bytesToBase64(secret);
    storageMap.set('aegis_biometric_wrapping_secret', legacyRawSecret);

    resetBiometricCacheForTesting();
    await hydrateBiometric();

    // First unlock takes the legacy path (native prompt) and rotates.
    await expect(authenticateBiometric()).resolves.toBe('legacy-pass');
    expect(nativeAuthenticate).toHaveBeenCalledTimes(1);
    expect(wrap).toHaveBeenCalledTimes(1);

    const rotated = storageMap.get('aegis_biometric_wrapping_secret')!;
    expect(() => JSON.parse(rotated)).not.toThrow();
    expect(JSON.parse(rotated)).toMatchObject({ v: 2, iv: expect.any(String), ct: expect.any(String) });

    // Second unlock goes through the hardware-bound handle only (single prompt).
    resetBiometricCacheForTesting();
    await hydrateBiometric();
    await expect(authenticateBiometric()).resolves.toBe('legacy-pass');
    expect(nativeAuthenticate).toHaveBeenCalledTimes(1); // unchanged
    expect(unwrap).toHaveBeenCalledTimes(1);
  });

  it('android bridge: rotation failure never breaks the legacy unlock (best-effort, RUST-O5)', async () => {
    mockTauriAndroidRuntime();
    const { storageMap, wrap } = installAndroidBridgeMock({ wrapError: 'Encrypt setup failed: user cancelled' });

    const secret = crypto.getRandomValues(new Uint8Array(32));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const wrappingKey = await derivePbkdf2KeyForTest(secret, salt, 1000);
    const bundle = await webCryptoAesGcmEncrypt('legacy-pass', wrappingKey, generateSafeIv());
    storageMap.set('aegis_biometric_info', JSON.stringify({
      version: 3,
      provider: 'Tauri Native Biometric',
      kdf: 'WebCrypto PBKDF2-SHA256',
      cipher: 'WebCrypto AES-256-GCM',
      salt: bytesToBase64(salt),
      bundle,
      pbkdf2Iterations: 1000,
    }));
    const legacyRawSecret = bytesToBase64(secret);
    storageMap.set('aegis_biometric_wrapping_secret', legacyRawSecret);

    resetBiometricCacheForTesting();
    await hydrateBiometric();

    await expect(authenticateBiometric()).resolves.toBe('legacy-pass');
    expect(wrap).toHaveBeenCalledTimes(1);
    // The legacy raw secret is retained so rotation is retried on the next unlock.
    expect(storageMap.get('aegis_biometric_wrapping_secret')).toBe(legacyRawSecret);
  });
});

async function derivePbkdf2KeyForTest(secret: Uint8Array, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', secret, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}
