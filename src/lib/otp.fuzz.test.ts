import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { generateTOTP, TOTPValidationError } from './otp';

const fuzzConfig = { numRuns: 120, seed: 0x079F0 };

const validBase32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const validBase32Secret = fc.array(fc.constantFrom(...validBase32Chars.split('')), { minLength: 16, maxLength: 64 })
  .map((arr) => arr.join(''));

const supportedDigits = fc.constantFrom<6 | 7 | 8>(6, 7, 8);
const supportedAlgorithms = fc.constantFrom<'SHA1' | 'SHA256' | 'SHA512'>('SHA1', 'SHA256', 'SHA512');
const validPeriods = fc.integer({ min: 15, max: 300 });

describe('TOTP generator fuzz tests', () => {
  it('generates valid formatted TOTP codes for arbitrary valid Base32 secrets and parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBase32Secret,
        supportedAlgorithms,
        supportedDigits,
        validPeriods,
        fc.date({ min: new Date('2020-01-01T00:00:00.000Z'), max: new Date('2050-01-01T00:00:00.000Z') }),
        async (secret, algorithm, digits, periodSeconds, date) => {
          const code = await generateTOTP(secret, {
            algorithm,
            digits,
            periodSeconds,
            timestampMs: date.getTime(),
            formatted: false,
          });

          expect(code).toHaveLength(digits);
          expect(/^\d+$/.test(code)).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });

  it('safely handles arbitrary noisy and corrupted secret strings without crashing', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 128 }),
        async (arbitrarySecret) => {
          const code = await generateTOTP(arbitrarySecret);
          expect(typeof code).toBe('string');
          expect(code.length).toBeGreaterThanOrEqual(6);
        },
      ),
      fuzzConfig,
    );
  });

  it('rejects unsupported digit counts with TOTPValidationError', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBase32Secret,
        fc.integer({ min: -50, max: 50 }).filter((d) => ![6, 7, 8].includes(d)),
        async (secret, invalidDigits) => {
          await expect(
            generateTOTP(secret, { digits: invalidDigits }),
          ).rejects.toBeInstanceOf(TOTPValidationError);
        },
      ),
      fuzzConfig,
    );
  });

  it('rejects out-of-range periods (< 15 or > 300) with TOTPValidationError', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBase32Secret,
        fc.oneof(fc.integer({ min: -100, max: 14 }), fc.integer({ min: 301, max: 5000 })),
        async (secret, invalidPeriod) => {
          await expect(
            generateTOTP(secret, { periodSeconds: invalidPeriod }),
          ).rejects.toBeInstanceOf(TOTPValidationError);
        },
      ),
      fuzzConfig,
    );
  });

  it('handles fuzz-generated otpauth:// URIs with arbitrary query parameters', async () => {
    await fc.assert(
      fc.asyncProperty(
        validBase32Secret,
        fc.string({ maxLength: 30 }).filter((s) => !/[^a-zA-Z0-9_-]/.test(s)),
        fc.string({ maxLength: 30 }).filter((s) => !/[^a-zA-Z0-9_-]/.test(s)),
        async (secret, label, issuer) => {
          const uri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
          const code = await generateTOTP(uri, { formatted: false });
          expect(code).toHaveLength(6);
          expect(/^\d{6}$/.test(code)).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });
});
