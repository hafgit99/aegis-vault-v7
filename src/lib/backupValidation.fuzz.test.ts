import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  BackupValidationError,
  MAX_BACKUP_FILE_SIZE,
  validateBackupPayload,
  validationErrorCodes,
} from './backupValidation';

const fuzzConfig = { numRuns: 120, seed: 0xBA07 };

describe('backup validation fuzz tests', () => {
  it('rejects backup sizes exceeding MAX_BACKUP_FILE_SIZE with backupTooLarge error', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: MAX_BACKUP_FILE_SIZE + 1, max: MAX_BACKUP_FILE_SIZE * 5 }),
        (oversized) => {
          try {
            validateBackupPayload([], oversized);
            expect.unreachable('Should have thrown BackupValidationError');
          } catch (error: any) {
            expect(error).toBeInstanceOf(BackupValidationError);
            expect(error.code).toBe(validationErrorCodes.backupTooLarge);
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('rejects non-object primitives with invalidBackupFormat error', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer(), fc.string(), fc.boolean(), fc.constant(null), fc.constant(undefined)),
        (invalidPrimitive) => {
          try {
            validateBackupPayload(invalidPrimitive, 1024);
            expect.unreachable('Should have thrown BackupValidationError');
          } catch (error: any) {
            expect(error).toBeInstanceOf(BackupValidationError);
            expect(error.code).toBe(validationErrorCodes.invalidBackupFormat);
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('safely validates arbitrary dictionary structures and throws only typed BackupValidationError or succeeds', () => {
    fc.assert(
      fc.property(
        fc.dictionary(
          fc.string({ maxLength: 20 }),
          fc.oneof(fc.string({ maxLength: 50 }), fc.integer(), fc.boolean(), fc.constant(null)),
          { maxKeys: 10 },
        ),
        (arbitraryObj) => {
          try {
            validateBackupPayload(arbitraryObj, 1024);
          } catch (error) {
            expect(error).toBeInstanceOf(BackupValidationError);
          }
        },
      ),
      fuzzConfig,
    );
  });

  it('validates correctly structured v7 backup envelope with valid items and attachments', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.uuid(),
            title: fc.string({ minLength: 1, maxLength: 60 }),
            category: fc.constantFrom('login', 'card', 'passkey', 'identity', 'secure_note'),
            createdAt: fc.date().map((d) => d.toISOString()),
            updatedAt: fc.date().map((d) => d.toISOString()),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (items) => {
          const envelope = {
            version: '7.0',
            app: 'AegisVault',
            exportedAt: new Date().toISOString(),
            items,
            attachments: [],
          };

          const result = validateBackupPayload(envelope, 5000);
          expect(result.items).toHaveLength(items.length);
          expect(result.attachments).toHaveLength(0);
        },
      ),
      fuzzConfig,
    );
  });
});
