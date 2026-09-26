/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

/**
 * O-4 regression proof, end to end.
 *
 * `navigator.credentials.get` is replaced with a scripted authenticator, so the
 * full path runs: challenge generation -> assertion -> verification -> sign
 * count update. Re-enabling the O-4 fix's removal makes these fail, which is
 * the point: the previous implementation returned success for ANY assertion
 * whose credential id matched.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PasskeyRecord } from './passkey';

const RP_ID = 'vault.example.com';
const ORIGIN = 'https://vault.example.com';

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signCountBytes(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

async function es256KeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return {
    publicKey: toBase64Url(spki),
    async signRaw(data: Uint8Array): Promise<Uint8Array> {
      return new Uint8Array(await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        data as unknown as BufferSource,
      ));
    },
  };
}

/** WebAuthn ES256 signatures are DER; WebCrypto emits raw r||s. */
function rawToDer(signature: Uint8Array): Uint8Array {
  const encodeInt = (value: Uint8Array): Uint8Array => {
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start += 1;
    const trimmed = value.subarray(start);
    const needsPad = (trimmed[0]! & 0x80) !== 0;
    return concat(
      new Uint8Array([0x02, trimmed.length + (needsPad ? 1 : 0)]),
      needsPad ? concat(new Uint8Array([0x00]), trimmed) : trimmed,
    );
  };
  const body = concat(encodeInt(signature.subarray(0, 32)), encodeInt(signature.subarray(32)));
  return concat(new Uint8Array([0x30, body.length]), body);
}

const CREDENTIAL_ID = new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]);

/**
 * Installs a scripted authenticator. `sign` receives the signed bytes so the
 * test can choose to sign the right data, the wrong data, or nothing at all.
 */
function installAuthenticator(options: {
  challenge: Uint8Array;
  sign: (signedData: Uint8Array) => Promise<Uint8Array>;
  signCount?: number;
  flags?: number;
  origin?: string;
  type?: string;
  /**
   * RP ID the authenticator builds its `rpIdHash` from. Defaults to the RP ID
   * in the request, which is the honest case. Setting it to something else
   * models an authenticator that signs for a different relying party.
   */
  authenticatorRpId?: string;
}) {
  const credentialsGet = vi.fn(async (request: CredentialRequestOptions) => {
    const publicKey = request.publicKey as PublicKeyCredentialRequestOptions;
    const challengeBytes = new Uint8Array(publicKey.challenge as ArrayBuffer);
    const rpIdHash = await sha256(new TextEncoder().encode(
      options.authenticatorRpId ?? (publicKey.rpId as string),
    ));
    const authenticatorDataBytes = concat(
      rpIdHash,
      new Uint8Array([options.flags ?? 0x01]),
      signCountBytes(options.signCount ?? 7),
    );
    const clientDataJson = new TextEncoder().encode(JSON.stringify({
      type: options.type ?? 'webauthn.get',
      challenge: toBase64Url(new Uint8Array(challengeBytes)),
      origin: options.origin ?? window.location.origin,
      crossOrigin: false,
    }));
    const signedData = concat(authenticatorDataBytes, await sha256(clientDataJson));
    const signature = await options.sign(signedData);

    return {
      id: toBase64Url(CREDENTIAL_ID),
      rawId: CREDENTIAL_ID.buffer,
      type: 'public-key',
      response: {
        clientDataJSON: clientDataJson.buffer,
        authenticatorData: authenticatorDataBytes.buffer,
        signature: signature.buffer,
        userHandle: null,
      },
    } as unknown as PublicKeyCredential;
  });

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: { get: credentialsGet, create: vi.fn() },
  });
  Object.defineProperty(globalThis, 'PublicKeyCredential', {
    configurable: true,
    value: function PublicKeyCredentialStub() {},
  });

  return { credentialsGet };
}

describe('O-4: authenticateAndIncrementPasskey verifies the assertion', () => {
  let keys: Awaited<ReturnType<typeof es256KeyPair>>;
  let record: PasskeyRecord;

  beforeEach(async () => {
    keys = await es256KeyPair();
    record = {
      itemId: 'item-1',
      credentialId: toBase64Url(CREDENTIAL_ID),
      publicKey: keys.publicKey,
      privateKeyBundle: { iv: toBase64(new Uint8Array(12)), tag: toBase64(new Uint8Array(16)), ciphertext: toBase64(new Uint8Array(1)) },
      rpId: RP_ID,
      rpName: RP_ID,
      userName: 'alice',
      signCount: 3,
      algorithm: 'ES256',
      createdAt: '2026-09-26T00:00:00.000Z',
    };
    // jsdom serves the app from http://localhost:3000 in tests.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, origin: ORIGIN, href: `${ORIGIN}/` },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('succeeds and records the VERIFIED sign count for a genuine assertion', async () => {
    const { authenticateAndIncrementPasskey } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    installAuthenticator({
      challenge,
      signCount: 7,
      sign: async (data) => rawToDer(await keys.signRaw(data)),
    });

    const { assertion, updatedRecord } = await authenticateAndIncrementPasskey(record, { challenge });

    // The stored counter now reflects what the authenticator actually signed,
    // not a local +1.
    expect(updatedRecord.signCount).toBe(7);
    expect(assertion.credentialId).toBe(record.credentialId);
    expect(updatedRecord.lastUsedAt).toBeTruthy();
  });

  it('REJECTS an assertion whose signature does not verify (the O-4 defect)', async () => {
    const { authenticateAndIncrementPasskey, PasskeyError } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    const impostor = await es256KeyPair();
    installAuthenticator({
      challenge,
      signCount: 7,
      // A perfectly well-formed signature — by the WRONG key.
      sign: async (data) => rawToDer(await impostor.signRaw(data)),
    });

    await expect(authenticateAndIncrementPasskey(record, { challenge }))
      .rejects.toBeInstanceOf(PasskeyError);
  });

  it('REJECTS an assertion signed over different bytes', async () => {
    const { authenticateAndIncrementPasskey, PasskeyError } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    installAuthenticator({
      challenge,
      signCount: 7,
      sign: async () => rawToDer(await keys.signRaw(new Uint8Array([1, 2, 3]))),
    });

    await expect(authenticateAndIncrementPasskey(record, { challenge }))
      .rejects.toBeInstanceOf(PasskeyError);
  });

  it('REJECTS an assertion signed by an authenticator for a different relying party', async () => {
    const { authenticateAndIncrementPasskey, PasskeyError } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    installAuthenticator({
      challenge,
      signCount: 7,
      // The record is registered for RP_ID, but the authenticator produces
      // authenticator data bound to a different RP.
      authenticatorRpId: 'phish.example.com',
      sign: async (data) => rawToDer(await keys.signRaw(data)),
    });

    await expect(authenticateAndIncrementPasskey(record, { challenge }))
      .rejects.toBeInstanceOf(PasskeyError);
  });

  it('REJECTS an assertion for a different origin', async () => {
    const { authenticateAndIncrementPasskey, PasskeyError } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    installAuthenticator({
      challenge,
      signCount: 7,
      origin: 'https://phish.example',
      sign: async (data) => rawToDer(await keys.signRaw(data)),
    });

    await expect(authenticateAndIncrementPasskey(record, { challenge }))
      .rejects.toBeInstanceOf(PasskeyError);
  });

  it('REJECTS an assertion with no signature at all', async () => {
    const { authenticateAndIncrementPasskey, PasskeyError } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    installAuthenticator({ challenge, sign: async () => new Uint8Array(0) });

    await expect(authenticateAndIncrementPasskey(record, { challenge }))
      .rejects.toBeInstanceOf(PasskeyError);
  });

  it('REJECTS an assertion whose counter went backwards (clone signal)', async () => {
    const { authenticateAndIncrementPasskey, PasskeyError } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    installAuthenticator({
      challenge,
      signCount: 1,
      sign: async (data) => rawToDer(await keys.signRaw(data)),
    });

    // The record claims 3; an authenticator reporting 1 is a clone signal.
    await expect(authenticateAndIncrementPasskey(record, { challenge }))
      .rejects.toBeInstanceOf(PasskeyError);
  });

  it('REJECTS an assertion for a different credential id before verifying', async () => {
    const { authenticateAndIncrementPasskey, PasskeyError } = await import('./passkey');
    const challenge = new Uint8Array(32).fill(4);
    installAuthenticator({
      challenge,
      sign: async (data) => rawToDer(await keys.signRaw(data)),
    });

    // The scripted authenticator always returns CREDENTIAL_ID, so a record
    // holding a different one must be refused.
    await expect(authenticateAndIncrementPasskey(
      { ...record, credentialId: toBase64Url(new Uint8Array([1, 2, 3, 4])) },
      { challenge },
    )).rejects.toBeInstanceOf(PasskeyError);
  });
});
