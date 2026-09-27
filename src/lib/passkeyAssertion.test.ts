/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  base64UrlToBytes,
  bytesToBase64Url,
  derEcdsaToRaw,
  verifyPasskeyAssertion,
  type PasskeyVerificationInput,
} from './passkeyAssertion';

const RP_ID = 'vault.example.com';
const ORIGIN = 'https://vault.example.com';

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bigEndian(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value, false);
  return out;
}

/** Builds authenticator data with the given flags, counter and (optionally wrong) rpIdHash. */
async function authenticatorData(options: { flags?: number; signCount?: number; rpId?: string } = {}) {
  const rpIdHash = await sha256(new TextEncoder().encode(options.rpId ?? RP_ID));
  return concat(
    rpIdHash,
    new Uint8Array([options.flags ?? 0x01]),
    bigEndian(options.signCount ?? 1),
  );
}

function clientData(options: { type?: string; challenge?: Uint8Array; origin?: string; crossOrigin?: boolean } = {}) {
  return new TextEncoder().encode(JSON.stringify({
    type: options.type ?? 'webauthn.get',
    challenge: bytesToBase64Url(options.challenge ?? new Uint8Array(32).fill(9)),
    origin: options.origin ?? ORIGIN,
    crossOrigin: options.crossOrigin ?? false,
  }));
}

/** Generates an ES256 key pair and returns SPKI (base64url) plus a signer. */
async function es256KeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const raw = new Uint8Array(spki);
  // WebAuthn ES256 signatures are ASN.1 DER; WebCrypto emits raw r||s.
  const derFromRaw = (signature: Uint8Array): Uint8Array => {
    const encodeInt = (value: Uint8Array): Uint8Array => {
      let start = 0;
      while (start < value.length - 1 && value[start] === 0) start += 1;
      const trimmed = value.subarray(start);
      const needsPad = (trimmed[0]! & 0x80) !== 0;
      const body = concat(new Uint8Array([0x02, trimmed.length + (needsPad ? 1 : 0)]),
        needsPad ? concat(new Uint8Array([0x00]), trimmed) : trimmed);
      return body;
    };
    const r = encodeInt(signature.subarray(0, 32));
    const s = encodeInt(signature.subarray(32));
    const body = concat(r, s);
    return concat(new Uint8Array([0x30, body.length]), body);
  };
  return {
    publicKeyBase64Url: bytesToBase64Url(raw),
    sign: async (data: Uint8Array): Promise<Uint8Array> => {
      const rawSig = new Uint8Array(await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        pair.privateKey,
        data as unknown as BufferSource,
      ));
      return derFromRaw(rawSig);
    },
  };
}

async function rs256KeyPair() {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
  return {
    publicKeyBase64Url: bytesToBase64Url(spki),
    sign: async (data: Uint8Array): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      pair.privateKey,
      data as unknown as BufferSource,
    )),
  };
}

/** Builds a complete, genuinely valid ES256 assertion. */
async function validAssertion(overrides: Partial<PasskeyVerificationInput> = {}) {
  const keys = await es256KeyPair();
  const challenge = new Uint8Array(32).fill(7);
  const authData = await authenticatorData({ signCount: 5 });
  const client = clientData({ challenge });
  const signed = concat(authData, await sha256(client));
  const signature = await keys.sign(signed);

  return {
    keys,
    input: {
      publicKeyBase64Url: keys.publicKeyBase64Url,
      rpId: RP_ID,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      algorithm: 'ES256' as const,
      authenticatorData: authData,
      clientDataJson: client,
      signature,
      previousSignCount: 4,
      ...overrides,
    },
  };
}

describe('O-4: passkey assertion verification', () => {
  it('accepts a genuine ES256 assertion', async () => {
    const { input } = await validAssertion();
    const result = await verifyPasskeyAssertion(input);

    expect(result).toEqual({ verified: true, signCount: 5 });
  });

  it('accepts a genuine RS256 assertion', async () => {
    const keys = await rs256KeyPair();
    const challenge = new Uint8Array(32).fill(3);
    const authData = await authenticatorData({ signCount: 2 });
    const client = clientData({ challenge });
    const signature = await keys.sign(concat(authData, await sha256(client)));

    const result = await verifyPasskeyAssertion({
      publicKeyBase64Url: keys.publicKeyBase64Url,
      rpId: RP_ID,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      algorithm: 'RS256',
      authenticatorData: authData,
      clientDataJson: client,
      signature,
    });

    expect(result.verified).toBe(true);
  });

  // --- the finding: an unverified signature must never pass ---------------

  it('REJECTS a signature that does not verify against the stored public key', async () => {
    // This is the exact shape of the O-4 defect: the old code accepted anything
    // the platform returned, so a signature over different bytes passed.
    const { input, keys } = await validAssertion();
    const otherChallenge = new Uint8Array(32).fill(1);
    const otherAuthData = await authenticatorData({ signCount: 5 });
    const otherClient = clientData({ challenge: otherChallenge });
    // A perfectly valid signature — by a DIFFERENT key — over different data.
    const signature = await keys.sign(concat(otherAuthData, await sha256(otherClient)));

    const result = await verifyPasskeyAssertion({ ...input, signature });
    expect(result).toEqual({ verified: false, reason: 'signature-invalid' });
  });

  it('rejects a signature from a different key pair', async () => {
    const { input } = await validAssertion();
    const attacker = await es256KeyPair();
    const challenge = new Uint8Array(32).fill(7);
    const authData = await authenticatorData({ signCount: 5 });
    const client = clientData({ challenge });
    const signature = await attacker.sign(concat(authData, await sha256(client)));

    expect((await verifyPasskeyAssertion({ ...input, signature })).verified).toBe(false);
  });

  it('rejects a tampered authenticatorData (RP ID hash swapped)', async () => {
    const { input } = await validAssertion();
    const forged = await authenticatorData({ signCount: 5, rpId: 'evil.example.com' });

    expect((await verifyPasskeyAssertion({ ...input, authenticatorData: forged })))
      .toEqual({ verified: false, reason: 'rp-id-mismatch' });
  });

  it('rejects an assertion bound to a different RP ID', async () => {
    const { input } = await validAssertion();

    expect((await verifyPasskeyAssertion({ ...input, rpId: 'other.example.com' })))
      .toEqual({ verified: false, reason: 'rp-id-mismatch' });
  });

  it('rejects a replayed assertion whose challenge is not the one issued', async () => {
    const { input } = await validAssertion();

    expect((await verifyPasskeyAssertion({ ...input, expectedChallenge: new Uint8Array(32).fill(42) })))
      .toEqual({ verified: false, reason: 'challenge-mismatch' });
  });

  it('rejects an assertion made for a different origin', async () => {
    const { input } = await validAssertion();

    expect((await verifyPasskeyAssertion({ ...input, expectedOrigin: 'https://phish.example' })))
      .toEqual({ verified: false, reason: 'origin-mismatch' });
  });

  it('rejects a cross-origin assertion', async () => {
    const challenge = new Uint8Array(32).fill(7);
    const authData = await authenticatorData();
    const client = clientData({ challenge, crossOrigin: true });
    const keys = await es256KeyPair();
    const signature = await keys.sign(concat(authData, await sha256(client)));

    expect((await verifyPasskeyAssertion({
      publicKeyBase64Url: keys.publicKeyBase64Url,
      rpId: RP_ID,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      algorithm: 'ES256',
      authenticatorData: authData,
      clientDataJson: client,
      signature,
    }))).toEqual({ verified: false, reason: 'cross-origin' });
  });

  it('rejects a registration ceremony masquerading as an assertion', async () => {
    const { input } = await validAssertion({ clientDataJson: clientData({ type: 'webauthn.create' }) });

    expect((await verifyPasskeyAssertion(input)))
      .toEqual({ verified: false, reason: 'wrong-ceremony-type' });
  });

  it('rejects an assertion with the User Present flag clear', async () => {
    const { input } = await validAssertion({ authenticatorData: await authenticatorData({ flags: 0x00 }) });

    expect((await verifyPasskeyAssertion(input)))
      .toEqual({ verified: false, reason: 'user-not-present' });
  });

  it('rejects truncated authenticator data', async () => {
    const { input } = await validAssertion({ authenticatorData: new Uint8Array(20) });

    expect((await verifyPasskeyAssertion(input)))
      .toEqual({ verified: false, reason: 'authenticator-data-truncated' });
  });

  it('rejects an assertion with no verifiable material', async () => {
    const { input } = await validAssertion({ signature: new Uint8Array(0) });

    expect((await verifyPasskeyAssertion(input)))
      .toEqual({ verified: false, reason: 'missing-material' });
  });

  it('rejects unparsable client data', async () => {
    const { input } = await validAssertion({ clientDataJson: new TextEncoder().encode('{oops') });

    expect((await verifyPasskeyAssertion(input)))
      .toEqual({ verified: false, reason: 'client-data-unparsable' });
  });

  it('reports a sign counter that did not advance as a clone signal', async () => {
    const { input } = await validAssertion({ previousSignCount: 9 });

    expect((await verifyPasskeyAssertion(input)))
      .toEqual({ verified: false, reason: 'sign-count-regressed' });
  });

  it('accepts a zero sign counter from an authenticator that does not implement one', async () => {
    // Multi-device passkeys legitimately keep the counter at 0, and the
    // clone check must not fire on that.
    const challenge = new Uint8Array(32).fill(7);
    const authData = await authenticatorData({ signCount: 0 });
    const client = clientData({ challenge });
    const keys = await es256KeyPair();
    const signature = await keys.sign(concat(authData, await sha256(client)));

    const result = await verifyPasskeyAssertion({
      publicKeyBase64Url: keys.publicKeyBase64Url,
      rpId: RP_ID,
      expectedChallenge: challenge,
      expectedOrigin: ORIGIN,
      algorithm: 'ES256',
      authenticatorData: authData,
      clientDataJson: client,
      signature,
      previousSignCount: 0,
    });

    expect(result).toEqual({ verified: true, signCount: 0 });
  });

  it('rejects a mismatched user handle', async () => {
    const { input } = await validAssertion({
      userHandleBase64Url: bytesToBase64Url(new Uint8Array([1, 2, 3])),
      expectedUserHandleBase64Url: bytesToBase64Url(new Uint8Array([4, 5, 6])),
    });

    expect((await verifyPasskeyAssertion(input)))
      .toEqual({ verified: false, reason: 'user-handle-mismatch' });
  });
});

describe('O-4: DER to raw ECDSA conversion', () => {
  function encodeInt(value: Uint8Array): Uint8Array {
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start += 1;
    const trimmed = value.subarray(start);
    const needsPad = (trimmed[0]! & 0x80) !== 0;
    return concat(new Uint8Array([0x02, trimmed.length + (needsPad ? 1 : 0)]),
      needsPad ? concat(new Uint8Array([0x00]), trimmed) : trimmed);
  }

  function der(r: Uint8Array, s: Uint8Array): Uint8Array {
    const body = concat(encodeInt(r), encodeInt(s));
    return concat(new Uint8Array([0x30, body.length]), body);
  }

  it('round-trips a 32-byte r and s', () => {
    const r = new Uint8Array(32).fill(0xab);
    const s = new Uint8Array(32).fill(0xcd);
    const raw = derEcdsaToRaw(der(r, s));

    expect(raw).toEqual(concat(r, s));
  });

  it('preserves short coordinates by right-aligning them', () => {
    const r = new Uint8Array([0x01, 0x02]);
    const s = new Uint8Array([0x03]);
    const raw = derEcdsaToRaw(der(r, s))!;

    expect(raw.length).toBe(64);
    expect(raw[30]).toBe(0x01);
    expect(raw[31]).toBe(0x02);
    expect(raw[63]).toBe(0x03);
  });

  it('handles a high-bit coordinate that DER pads with a zero', () => {
    const r = new Uint8Array(32).fill(0xff);
    const s = new Uint8Array(32).fill(0x80);
    const raw = derEcdsaToRaw(der(r, s));

    expect(raw).toEqual(concat(r, s));
  });

  it('handles a long-form sequence length', () => {
    // Body must land in 128..255 so the one-byte long form (0x81) is the
    // correct encoding. 70-byte coordinates give 2 * 72 = 144 bytes of body.
    const r = new Uint8Array(70).fill(0x11);
    const s = new Uint8Array(70).fill(0x22);
    const body = concat(encodeInt(r), encodeInt(s));
    expect(body.length).toBeGreaterThan(127);
    expect(body.length).toBeLessThan(256);

    const encoded = concat(new Uint8Array([0x30, 0x81, body.length]), body);
    const raw = derEcdsaToRaw(encoded);

    // Both coordinates are wider than P-256's 32 bytes, so the 32-byte default
    // slot must refuse them rather than silently truncating.
    expect(raw).toBeNull();

    // With a slot wide enough to hold them, the long form parses correctly and
    // each coordinate is right-aligned inside its own 72-byte slot.
    const wide = derEcdsaToRaw(encoded, 72);
    expect(wide).toEqual(concat(new Uint8Array([0, 0]), r, new Uint8Array([0, 0]), s));
  });

  it('rejects malformed input instead of producing garbage', () => {
    expect(derEcdsaToRaw(new Uint8Array([0x31, 0x00]))).toBeNull();
    expect(derEcdsaToRaw(new Uint8Array([0x30]))).toBeNull();
    expect(derEcdsaToRaw(new Uint8Array(0))).toBeNull();
  });
});

describe('O-4: base64url helpers', () => {
  it('round-trips arbitrary bytes without padding', () => {
    const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
    const encoded = bytesToBase64Url(bytes);

    expect(encoded).not.toContain('=');
    expect(base64UrlToBytes(encoded)).toEqual(bytes);
  });

  it('decodes the URL-safe alphabet', () => {
    // 0xFB 0xFF encodes to '+/' in standard base64 and '-_' in base64url.
    const encoded = bytesToBase64Url(new Uint8Array([0xfb, 0xff, 0xbf]));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
