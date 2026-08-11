/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { generateSafeIv, webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt } from './webcrypto';

describe('Cryptographic Performance Benchmarks', () => {
  it('measures WebCrypto AES-256-GCM encryption and decryption throughput', async () => {
    const rawKey = new Uint8Array(32).fill(42);
    const samplePayload = 'A'.repeat(50_000); // 50 KB payload

    const encStart = performance.now();
    const encrypted = await webCryptoAesGcmEncrypt(samplePayload, rawKey, generateSafeIv());
    const encDuration = performance.now() - encStart;

    const decStart = performance.now();
    const decrypted = await webCryptoAesGcmDecrypt(encrypted, rawKey);
    const decDuration = performance.now() - decStart;

    expect(decrypted).toBe(samplePayload);
    expect(encDuration).toBeLessThan(100);
    expect(decDuration).toBeLessThan(100);
  });

  it('measures CSPRNG IV generation throughput', () => {
    const startTime = performance.now();
    for (let index = 0; index < 1000; index++) {
      generateSafeIv();
    }
    const duration = performance.now() - startTime;
    expect(duration).toBeLessThan(100);
  });
});
