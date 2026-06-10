import { describe, expect, it } from 'vitest';

import {
  webCryptoAesGcmDecrypt,
  webCryptoAesGcmDecryptBytes,
  webCryptoAesGcmEncrypt,
  webCryptoAesGcmEncryptBytes,
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
});
