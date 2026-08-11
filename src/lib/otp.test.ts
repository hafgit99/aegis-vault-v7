import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTOTP, getTOTPTimeRemaining, TOTPValidationError } from './otp';

describe('otp helpers', () => {
  const rfcSha1Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const rfcSha256Secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZA';
  const rfcSha512Secret = [
    'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    'GEZDGNA',
  ].join('');

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a safe placeholder when no secret is provided', async () => {
    expect(await generateTOTP('')).toBe('000 000');
  });

  it('matches the RFC 6238 SHA-1 test vector', async () => {
    expect(
      await generateTOTP(rfcSha1Secret, {
        digits: 8,
        timestampMs: 59_000,
        formatted: false,
      }),
    ).toBe('94287082');
  });

  it('matches the RFC 6238 SHA-256 test vector', async () => {
    expect(
      await generateTOTP(rfcSha256Secret, {
        algorithm: 'SHA256',
        digits: 8,
        timestampMs: 59_000,
        formatted: false,
      }),
    ).toBe('46119246');
  });

  it('matches the RFC 6238 SHA-512 test vector', async () => {
    expect(
      await generateTOTP(rfcSha512Secret, {
        algorithm: 'SHA512',
        digits: 8,
        timestampMs: 59_000,
        formatted: false,
      }),
    ).toBe('90693936');
  });

  it('parses otpauth TOTP URIs with SHA-512 options', async () => {
    const uri = `otpauth://totp/Aegis:test@example.com?secret=${rfcSha512Secret}&issuer=Aegis&algorithm=SHA512&digits=8&period=30`;

    expect(
      await generateTOTP(uri, {
        timestampMs: 59_000,
        formatted: false,
      }),
    ).toBe('90693936');
  });

  it('returns a safe placeholder for unsupported otpauth algorithms', async () => {
    const uri = `otpauth://totp/Aegis:test@example.com?secret=${rfcSha1Secret}&algorithm=MD5`;

    expect(await generateTOTP(uri)).toBe('000 000');
  });

  it('returns a safe placeholder for invalid Base32 secrets', async () => {
    expect(await generateTOTP('not-a-valid-secret!')).toBe('000 000');
  });

  it('generates a stable six-digit code inside the same 30-second step', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T09:00:05.000Z'));
    const firstCode = await generateTOTP('JBSWY3DPEHPK3PXP');

    vi.setSystemTime(new Date('2026-06-10T09:00:29.000Z'));
    const secondCode = await generateTOTP('JBSWY3DPEHPK3PXP');

    expect(firstCode).toBe(secondCode);
    expect(firstCode).toMatch(/^\d{3} \d{3}$/);
  });

  it('rotates the generated code when the 30-second step changes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T09:00:29.000Z'));
    const firstCode = await generateTOTP('JBSWY3DPEHPK3PXP');

    vi.setSystemTime(new Date('2026-06-10T09:00:30.000Z'));
    const secondCode = await generateTOTP('JBSWY3DPEHPK3PXP');

    expect(firstCode).not.toBe(secondCode);
  });

  it('normalizes Base32 secrets with repeated whitespace and trailing padding', async () => {
    const clean = await generateTOTP(rfcSha1Secret, {
      digits: 8,
      timestampMs: 59_000,
      formatted: false,
    });
    const spaced = await generateTOTP('GEZD  GNBV\nGY3TQOJQ  GEZDGNBVGY3TQOJQ====', {
      digits: 8,
      timestampMs: 59_000,
      formatted: false,
    });

    expect(spaced).toBe(clean);
  });

  it('keeps eight-digit codes ungrouped when formatted output is requested', async () => {
    expect(
      await generateTOTP(rfcSha1Secret, {
        digits: 8,
        timestampMs: 59_000,
        formatted: true,
      }),
    ).toBe('94287082');
  });

  it('uses URI period values when calculating the TOTP step', async () => {
    const uri = `otpauth://totp/Aegis:test@example.com?secret=${rfcSha1Secret}&issuer=Aegis&period=45`;

    expect(await generateTOTP(uri, { timestampMs: 44_000, formatted: false })).not.toBe(
      await generateTOTP(uri, { timestampMs: 45_000, formatted: false }),
    );
  });

  it('rejects unsupported otpauth URI types and empty URI secrets safely', async () => {
    expect(await generateTOTP(`otpauth://hotp/Aegis:test@example.com?secret=${rfcSha1Secret}`)).toBe('000 000');
    expect(await generateTOTP('otpauth://totp/Aegis:test@example.com')).toBe('000 000');
  });

  it('throws explicit validation errors for unsupported digit and period options', async () => {
    await expect(generateTOTP(rfcSha1Secret, { digits: 5 })).rejects.toThrow(TOTPValidationError);
    await expect(generateTOTP(rfcSha1Secret, { digits: 9 })).rejects.toThrow(TOTPValidationError);
    await expect(generateTOTP(rfcSha1Secret, { digits: 10 })).rejects.toThrow(TOTPValidationError);
    await expect(generateTOTP(rfcSha1Secret, { periodSeconds: 0 })).rejects.toThrow(TOTPValidationError);
    await expect(generateTOTP(rfcSha1Secret, { periodSeconds: 301 })).rejects.toThrow(TOTPValidationError);
    expect(await generateTOTP('====')).toBe('000 000');
  });

  it('throws explicit validation errors for unsupported otpauth digit and period parameters', async () => {
    await expect(
      generateTOTP(`otpauth://totp/Aegis:test@example.com?secret=${rfcSha1Secret}&digits=10`),
    ).rejects.toThrow(TOTPValidationError);
    await expect(
      generateTOTP(`otpauth://totp/Aegis:test@example.com?secret=${rfcSha1Secret}&period=abc`),
    ).rejects.toThrow(TOTPValidationError);
  });

  it('serializes counters beyond the low 32-bit range in big-endian form', async () => {
    expect(
      await generateTOTP(rfcSha1Secret, {
        timestampMs: (0x100000000 + 1) * 30_000,
        formatted: false,
      }),
    ).toBe('108930');
  });

  it('calculates remaining time in current period', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T09:00:05.000Z'));
    expect(getTOTPTimeRemaining()).toBe(25);
  });
});
