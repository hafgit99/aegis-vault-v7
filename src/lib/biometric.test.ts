/**
 * @vitest-environment jsdom
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authenticateBiometric,
  BiometricError,
  biometricErrorCodes,
  disableBiometric,
  isBiometricEnabled,
  isBiometricSupported,
  pbkdf2Sha256,
  registerBiometric,
  hydrateBiometric,
  resetBiometricCacheForTesting,
} from './biometric';

const rawId = new Uint8Array([1, 2, 3, 4]).buffer;
const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

function mockWebAuthn({
  createCredential = { rawId },
  getCredential = { rawId },
}: {
  createCredential?: { rawId: ArrayBuffer } | null;
  getCredential?: { rawId: ArrayBuffer } | null;
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
  await deleteBiometricDatabase();
  resetBiometricCacheForTesting();
  mockWebAuthn();
  await hydrateBiometric();
});

afterEach(async () => {
  localStorage.clear();
  await deleteBiometricDatabase();
  resetBiometricCacheForTesting();
  vi.restoreAllMocks();
});

describe('biometric master password wrapper', () => {
  it('derives deterministic PBKDF2-SHA256 keys for legacy biometric bundles', () => {
    const singleBlock = pbkdf2Sha256(encoder.encode('password'), encoder.encode('salt'), 1, 32);
    const multiBlock = pbkdf2Sha256(encoder.encode('password'), encoder.encode('salt'), 2, 48);

    expect(bytesToHex(singleBlock)).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    expect(bytesToHex(multiBlock).slice(0, 64)).toBe(
      'ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43',
    );
    expect(multiBlock).toHaveLength(48);
  });

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
    const creationOptions = create.mock.calls[0][0] as CredentialCreationOptions;

    expect(isBiometricEnabled()).toBe(true);
    expect(stored).toMatchObject({
      version: 2,
      kdf: 'WebCrypto PBKDF2-SHA256',
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
    const requestOptions = get.mock.calls[0][0] as CredentialRequestOptions;
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

  it('rejects legacy biometric bundles that fail compatibility decrypt checks', async () => {
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
});
