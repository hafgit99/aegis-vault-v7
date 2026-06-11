/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  authenticateBiometric,
  disableBiometric,
  isBiometricEnabled,
  isBiometricSupported,
  registerBiometric,
} from './biometric';

const rawId = new Uint8Array([1, 2, 3, 4]).buffer;

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

beforeEach(() => {
  mockWebAuthn();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

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
    await expect(registerBiometric('master-pass')).rejects.toThrow('WebAuthn');
  });

  it('stores new biometric bundles with WebCrypto metadata', async () => {
    await registerBiometric('master-pass');

    const stored = JSON.parse(localStorage.getItem('aegis_biometric_info') ?? '{}');

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
  });

  it('can disable a stored biometric bundle', async () => {
    await registerBiometric('master-pass');

    disableBiometric();

    expect(isBiometricEnabled()).toBe(false);
  });

  it('rejects registration when the authenticator create flow is cancelled', async () => {
    mockWebAuthn({ createCredential: null });

    await expect(registerBiometric('master-pass')).rejects.toThrow('iptal');
    expect(isBiometricEnabled()).toBe(false);
  });

  it('authenticates and unwraps the master password through WebCrypto AES-GCM', async () => {
    await registerBiometric('master-pass');

    await expect(authenticateBiometric()).resolves.toBe('master-pass');
  });

  it('rejects authentication when no biometric bundle is stored', async () => {
    await expect(authenticateBiometric()).rejects.toThrow('bulunamad');
  });

  it('rejects authentication when the authenticator get flow is cancelled', async () => {
    await registerBiometric('master-pass');
    mockWebAuthn({ getCredential: null });

    await expect(authenticateBiometric()).rejects.toThrow('reddedildi');
  });

  it('rejects biometric unwrap when the authenticator raw id changes', async () => {
    await registerBiometric('master-pass');
    mockWebAuthn({ getCredential: { rawId: new Uint8Array([9, 9, 9, 9]).buffer } });

    await expect(authenticateBiometric()).rejects.toThrow();
  });
});
