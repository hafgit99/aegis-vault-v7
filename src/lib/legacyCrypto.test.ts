import { describe, expect, it } from 'vitest';

import {
  decryptLegacyAes256Gcm,
  decryptLegacyDataWithPassword,
  generateLegacyArgon2idHash,
  generateLegacyArgon2idKey,
  hkdfSha256,
  hmacSha256,
  sha256,
  verifyLegacyArgon2idHash,
} from './legacyCrypto';

const encoder = new TextEncoder();

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function createLegacyStreamEnvelope(plaintext: string, password: string, salt: string): string {
  let current = password + salt;
  for (let i = 0; i < 2000; i++) {
    let hash = 0;
    for (let j = 0; j < current.length; j++) {
      hash = (hash << 5) - hash + current.charCodeAt(j);
      hash &= hash;
    }
    current = hash.toString(16) + current.substring(0, Math.min(current.length, 16));
  }

  const legacyKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    legacyKey[i] = Math.abs(current.charCodeAt(i % current.length) ^ (i * 17)) % 256;
  }

  let state = 0;
  for (let i = 0; i < legacyKey.length; i++) {
    state = (state + legacyKey[i] * (i + 13)) & 0xffffffff;
  }

  const nextByte = () => {
    state = (state * 1664525 + 1013904223) & 0xffffffff;
    return (state >> 16) & 0xff;
  };

  const plaintextBytes = encoder.encode(plaintext);
  const encryptedBytes = new Uint8Array(plaintextBytes.length);
  for (let i = 0; i < plaintextBytes.length; i++) {
    encryptedBytes[i] = plaintextBytes[i] ^ nextByte();
  }

  return JSON.stringify({
    encrypted: true,
    salt,
    payload: base64(encryptedBytes),
  });
}

describe('legacy crypto compatibility helpers', () => {
  it('verifies legacy simulated Argon2id hashes after module isolation', () => {
    const hash = generateLegacyArgon2idHash('correct-password', 'fixed-legacy-salt');

    expect(verifyLegacyArgon2idHash('correct-password', hash)).toBe(true);
    expect(verifyLegacyArgon2idHash('wrong-password', hash)).toBe(false);
  });

  it('rejects malformed legacy Argon2id hashes and invalid parameter payloads', () => {
    const validKey = generateLegacyArgon2idKey('correct-password', 'tiny-salt', 4, 1, 1, 16);
    const hash = `$argon2id$v=19$m=4,t=1,p=1$tiny-salt$${base64(validKey)}`;

    expect(validKey).toHaveLength(16);
    expect(verifyLegacyArgon2idHash('correct-password', hash)).toBe(false);
    expect(verifyLegacyArgon2idHash('correct-password', 'not-a-real-hash')).toBe(false);
    expect(verifyLegacyArgon2idHash('correct-password', '$argon2id$v=19$m=bad,t=1,p=1$salt$key')).toBe(false);
  });

  it('derives deterministic SHA-256, HMAC, and multi-block HKDF outputs', () => {
    const shaHex = hex(sha256(encoder.encode('abc')));
    const hmacHex = hex(hmacSha256(encoder.encode('key'), encoder.encode('message')));
    const longKeyHmac = hmacSha256(encoder.encode('x'.repeat(80)), encoder.encode('message'));
    const expanded = hkdfSha256(encoder.encode('ikm'), encoder.encode('salt'), encoder.encode('info'), 80);

    expect(shaHex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hmacHex).toBe('6e9ef29b75fffc5b7abae527d58fdadb2fe42e7219011976917343065f58ed4a');
    expect(longKeyHmac).toHaveLength(32);
    expect(expanded).toHaveLength(80);
    expect(expanded.slice(32, 64)).not.toEqual(expanded.slice(0, 32));
  });

  it('decrypts authenticated legacy AES-GCM-compatible payload blocks', () => {
    const key = new Uint8Array(32).fill(7);
    const iv = new Uint8Array(12).fill(3);
    const ciphertext = encoder.encode('legacy ciphertext');
    const tag = hmacSha256(key, hmacSha256(iv, ciphertext)).subarray(0, 16);

    const decrypted = decryptLegacyAes256Gcm({
      iv: hex(iv),
      tag: hex(tag),
      ciphertext: base64(ciphertext),
    }, key);

    expect(decrypted).toHaveLength(ciphertext.length);
    expect(encoder.encode(decrypted)).not.toEqual(ciphertext);
  });

  it('rejects tampered legacy AES-GCM-compatible payloads before decrypting', () => {
    const key = new Uint8Array(32).fill(9);
    const iv = new Uint8Array(12).fill(2);
    const ciphertext = encoder.encode('tampered legacy data');

    expect(() => decryptLegacyAes256Gcm({
      iv: hex(iv),
      tag: hex(new Uint8Array(16).fill(1)),
      ciphertext: base64(ciphertext),
    }, key)).toThrow();
  });

  it('decrypts old stream-cipher fallback envelopes', () => {
    const envelope = createLegacyStreamEnvelope('{"items":[{"title":"Legacy"}]}', 'backup-pass', 'legacy-salt');

    expect(decryptLegacyDataWithPassword(envelope, 'backup-pass')).toBe('{"items":[{"title":"Legacy"}]}');
  });

  it('rejects malformed, incomplete, tampered, and unsupported backup envelopes', () => {
    expect(() => decryptLegacyDataWithPassword('{broken-json', 'backup-pass')).toThrow();
    expect(() => decryptLegacyDataWithPassword(JSON.stringify({ version: '1.1' }), 'backup-pass')).toThrow();

    const payload = base64(encoder.encode('cipher'));
    const checksum = hex(sha256(encoder.encode(payload)));
    expect(() => decryptLegacyDataWithPassword(JSON.stringify({
      version: '1.1',
      salt: 'salt',
      iv: '000000000000000000000000',
      tag: '00000000000000000000000000000000',
      payload,
      checksum: checksum.replace(/^./, checksum[0] === '0' ? '1' : '0'),
    }), 'backup-pass')).toThrow();

    expect(() => decryptLegacyDataWithPassword(JSON.stringify({
      version: '0.8',
      payload: base64(encoder.encode('plain')),
    }), 'backup-pass')).toThrow();
  });
});
