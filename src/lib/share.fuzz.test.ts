/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import type { VaultItem } from '../types';
import {
  base64urlDecode,
  base64urlEncode,
  decryptShareUrl,
  generateShareUrl,
} from './share';

const fuzzConfig = { numRuns: 120, seed: 0x54A8E };

const vaultCategory = fc.constantFrom<VaultItem['category']>('login', 'card', 'passkey', 'identity', 'secure_note');
const safeString = fc.string({ maxLength: 100 });

const arbitraryVaultItem = fc.record({
  id: fc.uuid(),
  title: safeString,
  username: safeString,
  password: safeString,
  url: safeString,
  notes: safeString,
  category: vaultCategory,
  totpSecret: fc.option(safeString, { nil: undefined }),
  createdAt: fc.date().map((d) => d.toISOString()),
  updatedAt: fc.date().map((d) => d.toISOString()),
  favorite: fc.boolean(),
}) as fc.Arbitrary<VaultItem>;

// Generate passwords that meet the minimum length requirement (>= 4 chars)
const sharePassword = fc.string({ minLength: 4, maxLength: 64 });

describe('share URL fuzz tests', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('base64urlEncode and base64urlDecode preserve arbitrary byte sequences', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ maxLength: 256 }),
        (bytes) => {
          const encoded = base64urlEncode(bytes);
          expect(encoded).not.toMatch(/[+/=]/);
          const decoded = base64urlDecode(encoded);
          expect(decoded).toEqual(bytes);
        },
      ),
      fuzzConfig,
    );
  });

  it('generateShareUrl and decryptShareUrl round-trip for arbitrary valid vault items with password', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryVaultItem,
        fc.integer({ min: 1, max: 24 }),
        sharePassword,
        async (item, durationHours, password) => {
          const url = await generateShareUrl(item, durationHours, password);
          expect(url).toContain('#share=');
          expect(url).toContain('&s=');
          // Key must NOT be in the URL
          expect(url).not.toContain('&k=');

          const hash = url.slice(url.indexOf('#'));
          const decrypted = await decryptShareUrl(hash, password);

          expect(decrypted).not.toBeNull();
          expect(decrypted?.title).toBe(item.title);
          expect(decrypted?.username).toBe(item.username);
          expect(decrypted?.password).toBe(item.password);
          expect(decrypted?.category).toBe(item.category);
          expect(decrypted?.expiresAt).toBeGreaterThan(Date.now());
        },
      ),
      fuzzConfig,
    );
  });

  it('decryptShareUrl returns null safely on arbitrary malformed hash fragments without throwing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 512 }),
        sharePassword,
        async (arbitraryHash, password) => {
          const result = await decryptShareUrl(arbitraryHash, password);
          // Must either resolve to null safely or if by extreme coincidence valid, an object
          if (result !== null) {
            expect(typeof result.title).toBe('string');
          } else {
            expect(result).toBeNull();
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('decryptShareUrl returns null when wrong password is used', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryVaultItem,
        sharePassword,
        sharePassword.filter((p) => p.length >= 4),
        async (item, correctPassword, wrongPassword) => {
          // Ensure passwords are different
          if (correctPassword === wrongPassword) return;

          const url = await generateShareUrl(item, 1, correctPassword);
          const hash = url.slice(url.indexOf('#'));
          const result = await decryptShareUrl(hash, wrongPassword);
          expect(result).toBeNull();
        },
      ),
      fuzzConfig,
    );
  });

  it('decryptShareUrl returns null when share payload or key is corrupted/tampered', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryVaultItem,
        sharePassword,
        fc.constantFrom('salt', 'ciphertext', 'tag', 'iv', 'truncated'),
        async (item, password, tamperTarget) => {
          const url = await generateShareUrl(item, 24, password);
          const hash = url.slice(url.indexOf('#'));
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const originalD = params.get('share') || '';
          const originalS = params.get('s') || '';

          let corruptedHash = '';
          if (tamperTarget === 'salt') {
            const corruptedS = originalS.startsWith('AAAA')
              ? 'BBBB' + originalS.slice(4)
              : 'AAAA' + originalS.slice(4);
            corruptedHash = `#share=${originalD}&s=${corruptedS}`;
          } else if (tamperTarget === 'truncated') {
            corruptedHash = `#share=${originalD.slice(0, 12)}&s=${originalS}`;
          } else {
            const bundleBytes = base64urlDecode(originalD);
            const bundle = JSON.parse(new TextDecoder().decode(bundleBytes)) as { i: string; t: string; c: string };
            if (tamperTarget === 'ciphertext') {
              bundle.c = bundle.c.length > 4
                ? bundle.c.slice(0, -4) + (bundle.c.endsWith('AAAA') ? 'BBBB' : 'AAAA')
                : 'AAAA';
            } else if (tamperTarget === 'tag') {
              bundle.t = (bundle.t.startsWith('00') ? 'ff' : '00') + bundle.t.slice(2);
            } else if (tamperTarget === 'iv') {
              bundle.i = (bundle.i.startsWith('00') ? 'ff' : '00') + bundle.i.slice(2);
            }
            const corruptedD = base64urlEncode(new TextEncoder().encode(JSON.stringify(bundle)));
            corruptedHash = `#share=${corruptedD}&s=${originalS}`;
          }

          const result = await decryptShareUrl(corruptedHash, password);
          expect(result).toBeNull();
        },
      ),
      fuzzConfig,
    );
  });
});
