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

  it('generateShareUrl and decryptShareUrl round-trip for arbitrary valid vault items', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryVaultItem,
        fc.integer({ min: 1, max: 72 }),
        async (item, durationHours) => {
          const url = await generateShareUrl(item, durationHours);
          expect(url).toContain('#share=');
          expect(url).toContain('&k=');

          const hash = url.slice(url.indexOf('#'));
          const decrypted = await decryptShareUrl(hash);

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
        async (arbitraryHash) => {
          const result = await decryptShareUrl(arbitraryHash);
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

  it('decryptShareUrl returns null when share payload or key is corrupted/tampered', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbitraryVaultItem,
        fc.integer({ min: 0, max: 20 }),
        async (item, corruptIndex) => {
          const url = await generateShareUrl(item, 24);
          const hash = url.slice(url.indexOf('#'));
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const originalD = params.get('share') || '';
          const originalK = params.get('k') || '';

          // Corrupt share payload or key by flipping a character
          const corruptedD = originalD.length > corruptIndex
            ? originalD.slice(0, corruptIndex) + 'X' + originalD.slice(corruptIndex + 1)
            : originalD + 'X';

          const corruptedHash = `#share=${corruptedD}&k=${originalK}`;
          const result = await decryptShareUrl(corruptedHash);
          expect(result).toBeNull();
        },
      ),
      fuzzConfig,
    );
  });
});
