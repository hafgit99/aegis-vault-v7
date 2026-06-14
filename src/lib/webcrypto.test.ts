import { describe, expect, it } from 'vitest';

import {
  webCryptoAesGcmDecrypt,
  webCryptoAesGcmDecryptBytes,
  webCryptoAesGcmEncrypt,
  webCryptoAesGcmEncryptBytes,
  generateSafeIv,
} from './webcrypto';

describe('WebCrypto AES-GCM adapter', () => {
  it('roundtrips plaintext and exposes detached tag metadata', async () => {
    const key = new Uint8Array(32).fill(9);
    const iv = new Uint8Array(12).fill(3);

    const payload = await webCryptoAesGcmEncrypt('secret note', key, iv);

    expect(payload.iv).toBe('030303030303030303030303');
    expect(payload.tag).toHaveLength(32);
    expect(payload.ciphertext).not.toContain('secret note');
    await expect(webCryptoAesGcmDecrypt(payload, key)).resolves.toBe('secret note');
  });

  it('rejects tampered authentication tags', async () => {
    const key = new Uint8Array(32).fill(9);
    const iv = new Uint8Array(12).fill(3);
    const payload = await webCryptoAesGcmEncrypt('secret note', key, iv);

    await expect(
      webCryptoAesGcmDecrypt({ ...payload, tag: `00${payload.tag.slice(2)}` }, key),
    ).rejects.toThrow();
  });

  it('roundtrips binary payloads', async () => {
    const key = new Uint8Array(32).fill(7);
    const iv = new Uint8Array(12).fill(4);
    const input = new Uint8Array([1, 2, 3, 250]).buffer;

    const payload = await webCryptoAesGcmEncryptBytes(input, key, iv);

    expect(payload.iv).toBe('040404040404040404040404');
    expect(payload.tag).toHaveLength(32);
    await expect(webCryptoAesGcmDecryptBytes(payload, key)).resolves.toEqual(input);
  });

  it('generates unique, 12-byte counter-based safe nonces', () => {
    const iv1 = generateSafeIv();
    const iv2 = generateSafeIv();

    expect(iv1).toHaveLength(12);
    expect(iv2).toHaveLength(12);
    // Prefix (first 8 bytes) should be equal since they are generated in the same session
    expect(iv1.slice(0, 8)).toEqual(iv2.slice(0, 8));
    // Counters (last 4 bytes) should be different/incremented
    expect(iv1[11] + 1).toBe(iv2[11]);
  });
});
