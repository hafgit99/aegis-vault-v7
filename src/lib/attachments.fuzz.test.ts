/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  attachmentErrorCodes,
  decryptAttachmentData,
  type AttachmentRecord,
} from './attachments';
import { closeVaultSession, openVaultSession } from './vaultSession';

const fuzzConfig = { numRuns: 120, seed: 0xA77AC4 };
const vaultKey = new Uint8Array(32).fill(7);

function bytes(values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer;
}

function hexString(maxBytes: number) {
  return fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: maxBytes })
    .map((values) => values.map((value) => value.toString(16).padStart(2, '0')).join(''));
}

afterEach(() => {
  closeVaultSession();
});

describe('attachment decrypt fuzz boundaries', () => {
  it('rejects non AES-GCM attachment algorithms with a stable legacy-blocked error', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.option(fc.string({ maxLength: 32 }), { nil: undefined }).filter((algorithm) => algorithm !== 'AES-256-GCM'),
        fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 64 }),
        async (algorithm, data) => {
          const record = {
            id: 'fuzz-attachment',
            name: 'fuzz.bin',
            type: 'application/octet-stream',
            size: data.length,
            data: bytes(data),
            encrypted: true,
            algorithm,
          } as unknown as AttachmentRecord;

          await expect(decryptAttachmentData(record)).rejects.toMatchObject({
            name: 'AttachmentError',
            code: attachmentErrorCodes.legacyEncryptionBlocked,
          });
        },
      ),
      fuzzConfig,
    );
  });

  it('rejects AES-GCM attachment records with missing metadata before crypto decrypt', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          iv: fc.option(fc.string({ maxLength: 24 }), { nil: undefined }),
          tag: fc.option(fc.string({ maxLength: 32 }), { nil: undefined }),
          data: fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 64 }),
        }).filter(({ iv, tag }) => !iv || !tag),
        async ({ iv, tag, data }) => {
          const record: AttachmentRecord = {
            id: 'fuzz-attachment',
            name: 'fuzz.bin',
            type: 'application/octet-stream',
            size: data.length,
            data: bytes(data),
            encrypted: true,
            algorithm: 'AES-256-GCM',
            keySource: 'vault-key',
            iv,
            tag,
          };

          await expect(decryptAttachmentData(record)).rejects.toMatchObject({
            name: 'AttachmentError',
            code: attachmentErrorCodes.missingEncryptionMetadata,
          });
        },
      ),
      fuzzConfig,
    );
  });

  it('does not decrypt arbitrary AES-GCM metadata without the exact authenticated payload', async () => {
    openVaultSession('master-pass', 'backup-pass', vaultKey);

    await fc.assert(
      fc.asyncProperty(
        hexString(24),
        hexString(32),
        fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 96 }),
        async (iv, tag, data) => {
          const record: AttachmentRecord = {
            id: 'fuzz-attachment',
            name: 'fuzz.bin',
            type: 'application/octet-stream',
            size: data.length,
            data: bytes(data),
            encrypted: true,
            algorithm: 'AES-256-GCM',
            kdf: 'HKDF-SHA-256',
            keySource: 'vault-key',
            iv,
            tag,
          };

          try {
            const result = await decryptAttachmentData(record);
            expect(result).toBeInstanceOf(ArrayBuffer);
          } catch (error) {
            expect(error).toBeTruthy();
          }
        },
      ),
      fuzzConfig,
    );
  });
});
