/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for the WebAuthn / Passkey authenticator module.
 *
 * The platform PublicKeyCredential API is not available in jsdom, so we
 * stub it through Object.defineProperty. Coverage focuses on Aegis-side
 * concerns: capability detection, encoding helpers, the no-master-string
 * wrap/unwrap cycle, vault field serialization, and validation.
 */

// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeVaultSession, openVaultSession } from './vaultSession';
import {
  decodeCredentialId,
  detectWebAuthnCapability,
  encodeCredentialId,
  PasskeyError,
  passkeyErrorCodes,
  recordToVaultFields,
  registerPasskey,
  SUPPORTED_PASSKEY_ALGORITHMS,
  unwrapPasskeyPrivateKey,
  vaultFieldsToRecord,
  type PasskeyRecord,
} from './passkey';

interface FakeAttestationResponse {
  clientDataJSON: ArrayBuffer;
  getPublicKey: () => ArrayBuffer;
  getPublicKeyAlgorithm: () => number;
  getTransports: () => string[];
  authenticatorAttachment: string;
}

interface FakePublicKeyCredential {
  rawId: ArrayBuffer;
  response: FakeAttestationResponse;
  type: 'public-key';
}

function makeFakeCredentialId(seed: number): ArrayBuffer {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) bytes[i] = (seed + i) & 0xff;
  return bytes.buffer;
}

function makeFakePublicKey(): ArrayBuffer {
  const bytes = new Uint8Array(65);
  bytes[0] = 0x04;
  for (let i = 1; i < bytes.length; i++) bytes[i] = (i * 7) & 0xff;
  return bytes.buffer;
}

function makeFakeAttestationResponse(): FakeAttestationResponse {
  return {
    clientDataJSON: new TextEncoder().encode('{"type":"webauthn.create"}').buffer as ArrayBuffer,
    getPublicKey: () => makeFakePublicKey(),
    getPublicKeyAlgorithm: () => -7,
    getTransports: () => ['usb', 'nfc'],
    authenticatorAttachment: 'platform',
  };
}

function makeFakeCredential(): FakePublicKeyCredential {
  return {
    rawId: makeFakeCredentialId(7),
    response: makeFakeAttestationResponse(),
    type: 'public-key',
  };
}

function stubCredentialsApi(uvpa: () => Promise<boolean> = async () => true): void {
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredential() {},
  });
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: vi.fn(async () => makeFakeCredential()),
      get: vi.fn(async () => makeFakeCredential()),
    },
  });
  (PublicKeyCredential as unknown as { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> })
    .isUserVerifyingPlatformAuthenticatorAvailable = vi.fn(uvpa);
}

function unstubCredentialsApi(): void {
  delete (globalThis as { PublicKeyCredential?: unknown }).PublicKeyCredential;
  delete (navigator as { credentials?: unknown }).credentials;
}

describe('passkey module - capability detection', () => {
  afterEach(() => {
    unstubCredentialsApi();
  });

  it('detects capability as unavailable when the credentials API is missing', async () => {
    const capability = await detectWebAuthnCapability();
    expect(capability.available).toBe(false);
    expect(capability.platform).toBe(false);
    expect(capability.crossPlatform).toBe(false);
    expect(capability.userVerifying).toBe(false);
  });

  it('detects platform capability when the user-verifying authenticator API is present', async () => {
    stubCredentialsApi();
    const capability = await detectWebAuthnCapability();
    expect(capability.available).toBe(true);
    expect(capability.platform).toBe(true);
    expect(capability.userVerifying).toBe(true);
  });

  it('falls back to cross-platform only when no user-verifying authenticator is exposed', async () => {
    stubCredentialsApi(async () => false);
    const capability = await detectWebAuthnCapability();
    expect(capability.available).toBe(true);
    expect(capability.platform).toBe(false);
    expect(capability.crossPlatform).toBe(true);
  });

  it('survives capability probes that throw', async () => {
    stubCredentialsApi(async () => { throw new Error('not allowed'); });
    const capability = await detectWebAuthnCapability();
    expect(capability.available).toBe(true);
    expect(capability.userVerifying).toBe(false);
  });
});

describe('passkey module - supported algorithm set', () => {
  it('exports the three COSE-backed algorithms expected by the WebAuthn spec subset', () => {
    expect(SUPPORTED_PASSKEY_ALGORITHMS.size).toBe(3);
    expect(SUPPORTED_PASSKEY_ALGORITHMS.has('ES256')).toBe(true);
    expect(SUPPORTED_PASSKEY_ALGORITHMS.has('EdDSA')).toBe(true);
    expect(SUPPORTED_PASSKEY_ALGORITHMS.has('RS256')).toBe(true);
  });
});

describe('passkey module - credential id encoding', () => {
  it('round-trips credential id encoding without padding characters', () => {
    const original = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    const encoded = encodeCredentialId(original);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');
    expect(encoded).not.toContain('=');
    const decoded = decodeCredentialId(encoded);
    expect(Array.from(decoded)).toEqual(Array.from(original));
  });

  it('rejects malformed base64url credential ids', () => {
    expect(() => decodeCredentialId('***not-base64***')).toThrowError(PasskeyError);
  });

  it('rejects empty credential ids with the dedicated error code', () => {
    try {
      decodeCredentialId('');
      expect.fail('Expected PasskeyError');
    } catch (error) {
      expect(error).toBeInstanceOf(PasskeyError);
      expect((error as PasskeyError).code).toBe(passkeyErrorCodes.invalidCredentialId);
    }
  });
});

describe('passkey module - registration lifecycle', () => {
  beforeEach(() => {
    openVaultSession('aegis-test-master', 'aegis-test-master', new Uint8Array(32).fill(5));
  });

  afterEach(() => {
    closeVaultSession();
    unstubCredentialsApi();
  });

  it('registers a passkey and wraps the recovery JWK with the active vault key', async () => {
    stubCredentialsApi();
    const result = await registerPasskey({
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice@example.com',
    });
    expect(result.record.rpId).toBe('example.com');
    expect(result.record.rpName).toBe('Example');
    expect(result.record.userName).toBe('alice@example.com');
    expect(result.record.algorithm).toBe('ES256');
    expect(result.record.signCount).toBe(0);
    expect(result.record.transports).toEqual(['usb', 'nfc']);
    expect(result.record.attachment).toBe('platform');
    expect(result.record.privateKeyBundle.iv).toMatch(/^[0-9a-f]+$/);
    expect(result.record.privateKeyBundle.tag).toMatch(/^[0-9a-f]+$/);
    expect(result.record.privateKeyBundle.ciphertext.length).toBeGreaterThan(0);
    expect(result.attestation.transports).toEqual(['usb', 'nfc']);
    expect(result.attestation.authenticatorAttachment).toBe('platform');
  });

  it('passes the Relying Party options through the WebAuthn ceremony', async () => {
    const create = vi.fn(async () => makeFakeCredential());
    Object.defineProperty(globalThis, 'PublicKeyCredential', {
      configurable: true,
      value: function PublicKeyCredential() {},
    });
    Object.defineProperty(navigator, 'credentials', {
      configurable: true,
      value: { create, get: vi.fn(async () => makeFakeCredential()) },
    });
    (PublicKeyCredential as unknown as { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> })
      .isUserVerifyingPlatformAuthenticatorAvailable = vi.fn(async () => true);
    await registerPasskey({
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice@example.com',
      algorithms: ['EdDSA', 'ES256'],
    });
    const firstCall = create.mock.calls[0] as unknown as [unknown] | undefined;
    const call = (firstCall ? firstCall[0] : undefined) as { publicKey: PublicKeyCredentialCreationOptions };
    expect(call.publicKey.rp.id).toBe('example.com');
    expect(call.publicKey.rp.name).toBe('Example');
    expect(call.publicKey.user.name).toBe('alice@example.com');
    expect(call.publicKey.pubKeyCredParams.map((p) => p.alg)).toEqual([-8, -7]);
    expect(call.publicKey.timeout).toBe(60_000);
    expect(call.publicKey.attestation).toBe('none');
  });

  it('round-trips a record through vault fields and restores an equivalent record', async () => {
    stubCredentialsApi();
    const result = await registerPasskey({
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice@example.com',
    });
    const fields = recordToVaultFields(result.record);
    expect(fields.passkeyCredentialId).toBe(result.record.credentialId);
    expect(fields.passkeyRpId).toBe('example.com');
    expect(fields.passkeyUserName).toBe('alice@example.com');
    expect(fields.passkeyAlgorithm).toBe('ES256');
    expect(fields.passkeyAttachment).toBe('platform');
    expect(fields.passkeyTransports).toEqual(['usb', 'nfc']);
    expect(fields.passkeyPrivateKeyBundle).toBeDefined();
    const restored = vaultFieldsToRecord(result.record.itemId, fields);
    expect(restored).not.toBeNull();
    expect(restored?.credentialId).toBe(result.record.credentialId);
    expect(restored?.rpId).toBe('example.com');
    expect(restored?.algorithm).toBe('ES256');
  });
});

describe('passkey module - registration validation', () => {
  beforeEach(() => {
    openVaultSession('aegis-test-master', 'aegis-test-master', new Uint8Array(32).fill(5));
  });

  afterEach(() => {
    closeVaultSession();
    unstubCredentialsApi();
  });

  it('rejects empty rpId with the missingRpId error code', async () => {
    stubCredentialsApi();
    try {
      await registerPasskey({ rpId: '', rpName: 'X', userName: 'u' });
      expect.fail('Expected PasskeyError');
    } catch (error) {
      expect(error).toBeInstanceOf(PasskeyError);
      expect((error as PasskeyError).code).toBe(passkeyErrorCodes.missingRpId);
    }
  });

  it('rejects rpId values that contain a scheme or path', async () => {
    stubCredentialsApi();
    try {
      await registerPasskey({ rpId: 'https://evil.example.com/', rpName: 'X', userName: 'u' });
      expect.fail('Expected PasskeyError');
    } catch (error) {
      expect(error).toBeInstanceOf(PasskeyError);
      expect((error as PasskeyError).code).toBe(passkeyErrorCodes.missingRpId);
    }
  });

  it('normalizes uppercase and surrounding whitespace in rpId values', async () => {
    stubCredentialsApi();
    const result = await registerPasskey({ rpId: '  EXAMPLE.COM  ', rpName: 'Example', userName: 'u' });
    expect(result.record.rpId).toBe('example.com');
  });

  it.each([
    'example',
    '.example.com',
    'example.com.',
    'example..com',
    '-example.com',
    'example-.com',
    'exa_mple.com',
    '127.0.0.1',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com',
  ])('rejects invalid rpId host syntax: %s', async (rpId) => {
    stubCredentialsApi();
    try {
      await registerPasskey({ rpId, rpName: 'X', userName: 'u' });
      expect.fail('Expected PasskeyError');
    } catch (error) {
      expect(error).toBeInstanceOf(PasskeyError);
      expect((error as PasskeyError).code).toBe(passkeyErrorCodes.missingRpId);
    }
  });

  it('rejects empty userName with the missingUserName error code', async () => {
    stubCredentialsApi();
    try {
      await registerPasskey({ rpId: 'example.com', rpName: 'X', userName: '   ' });
      expect.fail('Expected PasskeyError');
    } catch (error) {
      expect(error).toBeInstanceOf(PasskeyError);
      expect((error as PasskeyError).code).toBe(passkeyErrorCodes.missingUserName);
    }
  });

  it('rejects unsupported algorithms with the unsupportedAlgorithm error code', async () => {
    stubCredentialsApi();
    try {
      await registerPasskey({
        rpId: 'example.com',
        rpName: 'X',
        userName: 'u',
        algorithms: ['HS256' as never],
      });
      expect.fail('Expected PasskeyError');
    } catch (error) {
      expect(error).toBeInstanceOf(PasskeyError);
      expect((error as PasskeyError).code).toBe(passkeyErrorCodes.unsupportedAlgorithm);
    }
  });

  it('throws the unsupported error code when the credentials API is missing', async () => {
    try {
      await registerPasskey({ rpId: 'example.com', rpName: 'X', userName: 'u' });
      expect.fail('Expected PasskeyError');
    } catch (error) {
      expect(error).toBeInstanceOf(PasskeyError);
      expect((error as PasskeyError).code).toBe(passkeyErrorCodes.unsupported);
    }
  });
});

describe('passkey module - recovery (no-JS-master-string boundary)', () => {
  beforeEach(() => {
    openVaultSession('aegis-test-master', 'aegis-test-master', new Uint8Array(32).fill(5));
  });

  afterEach(() => {
    closeVaultSession();
    unstubCredentialsApi();
  });

  it('round-trips the wrapped JWK through the active vault key', async () => {
    stubCredentialsApi();
    const result = await registerPasskey({
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice@example.com',
    });
    const unwrapped = await unwrapPasskeyPrivateKey(result.record);
    expect(unwrapped).not.toBeNull();
    expect((unwrapped as unknown as { kid?: string })?.kid).toBe(result.record.credentialId);
  });

  it('returns null from unwrap when the vault session is closed', async () => {
    stubCredentialsApi();
    const result = await registerPasskey({
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice@example.com',
    });
    closeVaultSession();
    const unwrapped = await unwrapPasskeyPrivateKey(result.record);
    expect(unwrapped).toBeNull();
  });

  it('returns null from unwrap when the wrapped bundle is tampered with', async () => {
    stubCredentialsApi();
    const result = await registerPasskey({
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice@example.com',
    });
    const tampered: PasskeyRecord = {
      ...result.record,
      privateKeyBundle: {
        ...result.record.privateKeyBundle,
        tag: '00'.repeat(16),
      },
    };
    const unwrapped = await unwrapPasskeyPrivateKey(tampered);
    expect(unwrapped).toBeNull();
  });
});

describe('passkey module - vault field mapping', () => {
  it('returns null from vaultFieldsToRecord when required fields are missing', () => {
    expect(vaultFieldsToRecord('item-1', { passkeyRpId: 'example.com' })).toBeNull();
  });

  it('returns a record from vaultFieldsToRecord when minimal required fields are present', () => {
    const record = vaultFieldsToRecord('item-1', {
      passkeyCredentialId: 'abc',
      passkeyRpId: 'example.com',
      passkeyPrivateKeyBundle: { iv: '00', tag: '00', ciphertext: 'AA' },
    });
    expect(record).not.toBeNull();
    expect(record?.rpId).toBe('example.com');
    expect(record?.algorithm).toBe('ES256');
  });

  it('preserves the rpName when supplied in vault fields', () => {
    const record = vaultFieldsToRecord('item-1', {
      passkeyCredentialId: 'abc',
      passkeyRpId: 'example.com',
      passkeyRpName: 'Example',
      passkeyUserName: 'alice@example.com',
      passkeyAlgorithm: 'EdDSA',
      passkeyPrivateKeyBundle: { iv: '00', tag: '00', ciphertext: 'AA' },
    });
    expect(record?.rpName).toBe('Example');
    expect(record?.algorithm).toBe('EdDSA');
    expect(record?.userName).toBe('alice@example.com');
  });
});
