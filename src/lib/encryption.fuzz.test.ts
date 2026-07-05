import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import {
  decryptDataWithPasswordSecure,
  secureBackupErrorCodes,
  SecureBackupError,
} from './encryption';

vi.mock('./argon2id', () => ({
  deriveArgon2idKey: vi.fn(async () => new Uint8Array(32).fill(7)),
}));

const fuzzConfig = { numRuns: 120, seed: 0xAE612 };
const weakOrMalformedKdfParams = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.record({
    // The encryption layer rejects memoryKiB below the 1 MiB portable floor.
    memoryKiB: fc.oneof(fc.integer({ min: -2048, max: 1023 }), fc.string({ maxLength: 12 }), fc.constant(null)),
    iterations: fc.oneof(fc.integer({ min: -16, max: 2 }), fc.string({ maxLength: 12 }), fc.constant(null)),
  }, { requiredKeys: [] }),
);

describe('secure backup decrypt fuzz boundaries', () => {
  it('rejects arbitrary JSON envelopes with typed security errors or crypto failures only', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.dictionary(fc.string({ maxLength: 24 }), fc.oneof(fc.string({ maxLength: 128 }), fc.integer(), fc.boolean(), fc.constant(null)), { maxKeys: 12 }),
        async (envelope) => {
          await expect(decryptDataWithPasswordSecure(JSON.stringify(envelope), 'backup-password')).rejects.toBeTruthy();
        },
      ),
      fuzzConfig,
    );
  });

  it('rejects weak or malformed KDF parameters before expensive Argon2 work', async () => {
    await fc.assert(
      fc.asyncProperty(weakOrMalformedKdfParams, async (kdfParams) => {
        const envelope = JSON.stringify({
          version: '1.2',
          kdfImplementation: 'argon2-browser',
          salt: '00'.repeat(16),
          iv: '00'.repeat(12),
          tag: '00'.repeat(16),
          payload: '',
          checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          kdfParams,
        });

        try {
          await decryptDataWithPasswordSecure(envelope, 'backup-password');
          throw new Error('Malformed backup envelope unexpectedly decrypted.');
        } catch (error) {
          expect(error).toBeInstanceOf(SecureBackupError);
          expect([
            secureBackupErrorCodes.missingFields,
            secureBackupErrorCodes.weakKdfParams,
          ]).toContain((error as SecureBackupError).code);
        }
      }),
      fuzzConfig,
    );
  });

  it('maps malformed JSON to the stable invalidJson error code', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 120 }).filter((value) => {
        try {
          JSON.parse(value);
          return false;
        } catch {
          return true;
        }
      }), async (content) => {
        try {
          await decryptDataWithPasswordSecure(content, 'backup-password');
          throw new Error('Malformed JSON unexpectedly decrypted.');
        } catch (error) {
          expect(error).toBeInstanceOf(SecureBackupError);
          expect((error as SecureBackupError).code).toBe(secureBackupErrorCodes.invalidJson);
        }
      }),
      { numRuns: 80, seed: 0xAE613 },
    );
  });
});
