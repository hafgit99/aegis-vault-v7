/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authenticateBiometric, isBiometricEnabled, registerBiometric } from './biometric';

const rawId = new Uint8Array([1, 2, 3, 4]).buffer;

function mockWebAuthn(getRawId: ArrayBuffer = rawId) {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  });

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: vi.fn(async () => ({ rawId })),
      get: vi.fn(async () => ({ rawId: getRawId })),
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

  it('authenticates and unwraps the master password through WebCrypto AES-GCM', async () => {
    await registerBiometric('master-pass');

    await expect(authenticateBiometric()).resolves.toBe('master-pass');
  });

  it('rejects biometric unwrap when the authenticator raw id changes', async () => {
    await registerBiometric('master-pass');
    mockWebAuthn(new Uint8Array([9, 9, 9, 9]).buffer);

    await expect(authenticateBiometric()).rejects.toThrow();
  });
});
