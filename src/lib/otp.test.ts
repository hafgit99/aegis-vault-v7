import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTOTP, getTOTPTimeRemaining } from './otp';

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

  it('returns a safe placeholder when no secret is provided', () => {
    expect(generateTOTP('')).toBe('000 000');
  });

  it('matches the RFC 6238 SHA-1 test vector', () => {
    expect(generateTOTP(rfcSha1Secret, {
      digits: 8,
      timestampMs: 59_000,
      formatted: false,
    })).toBe('94287082');
  });

  it('matches the RFC 6238 SHA-256 test vector', () => {
    expect(generateTOTP(rfcSha256Secret, {
      algorithm: 'SHA256',
      digits: 8,
      timestampMs: 59_000,
      formatted: false,
    })).toBe('46119246');
  });

  it('matches the RFC 6238 SHA-512 test vector', () => {
    expect(generateTOTP(rfcSha512Secret, {
      algorithm: 'SHA512',
      digits: 8,
      timestampMs: 59_000,
      formatted: false,
    })).toBe('90693936');
  });

  it('parses otpauth TOTP URIs with SHA-512 options', () => {
    const uri = `otpauth://totp/Aegis:test@example.com?secret=${rfcSha512Secret}&issuer=Aegis&algorithm=SHA512&digits=8&period=30`;

    expect(generateTOTP(uri, {
      timestampMs: 59_000,
      formatted: false,
    })).toBe('90693936');
  });

  it('returns a safe placeholder for unsupported otpauth algorithms', () => {
    const uri = `otpauth://totp/Aegis:test@example.com?secret=${rfcSha1Secret}&algorithm=MD5`;

    expect(generateTOTP(uri)).toBe('000 000');
  });

  it('returns a safe placeholder for invalid Base32 secrets', () => {
    expect(generateTOTP('not-a-valid-secret!')).toBe('000 000');
  });

  it('generates a stable six-digit code inside the same 30-second step', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T09:00:05.000Z'));
    const firstCode = generateTOTP('JBSWY3DPEHPK3PXP');

    vi.setSystemTime(new Date('2026-06-10T09:00:29.000Z'));
    const secondCode = generateTOTP('JBSWY3DPEHPK3PXP');

    expect(firstCode).toBe(secondCode);
    expect(firstCode).toMatch(/^\d{3} \d{3}$/);
  });

  it('rotates the generated code when the 30-second step changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T09:00:29.000Z'));
    const firstCode = generateTOTP('JBSWY3DPEHPK3PXP');

    vi.setSystemTime(new Date('2026-06-10T09:00:30.000Z'));
    const secondCode = generateTOTP('JBSWY3DPEHPK3PXP');

    expect(firstCode).not.toBe(secondCode);
  });

  it('normalizes Base32 secrets with repeated whitespace and trailing padding', () => {
    const clean = generateTOTP(rfcSha1Secret, {
      digits: 8,
      timestampMs: 59_000,
      formatted: false,
    });
    const spaced = generateTOTP('GEZD  GNBV\nGY3TQOJQ  GEZDGNBVGY3TQOJQ====', {
      digits: 8,
      timestampMs: 59_000,
      formatted: false,
    });

    expect(spaced).toBe(clean);
  });

  it('keeps eight-digit codes ungrouped when formatted output is requested', () => {
    expect(generateTOTP(rfcSha1Secret, {
      digits: 8,
      timestampMs: 59_000,
      formatted: true,
    })).toBe('94287082');
  });

  it('uses URI period values when calculating the TOTP step', () => {
    const uri = `otpauth://totp/Aegis:test@example.com?secret=${rfcSha1Secret}&issuer=Aegis&period=45`;

    expect(generateTOTP(uri, { timestampMs: 44_000, formatted: false })).not.toBe(
      generateTOTP(uri, { timestampMs: 45_000, formatted: false }),
    );
  });

  it('rejects unsupported otpauth URI types and empty URI secrets safely', () => {
    expect(generateTOTP(`otpauth://hotp/Aegis:test@example.com?secret=${rfcSha1Secret}`)).toBe('000 000');
    expect(generateTOTP('otpauth://totp/Aegis:test@example.com')).toBe('000 000');
  });

  it('rejects unsupported digit and period options safely', () => {
    expect(generateTOTP(rfcSha1Secret, { digits: 5 })).toBe('000 000');
    expect(generateTOTP(rfcSha1Secret, { digits: 9 })).toBe('000 000');
    expect(generateTOTP(rfcSha1Secret, { periodSeconds: 0 })).toBe('000 000');
    expect(generateTOTP('====')).toBe('000 000');
  });

  it('serializes counters beyond the low 32-bit range in big-endian form', () => {
    expect(generateTOTP(rfcSha1Secret, {
      timestampMs: (0x100000000 + 1) * 30_000,
      formatted: false,
    })).toBe('108930');
  });

  it('reports remaining seconds in the current 30-second cycle', () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000Z'));
    expect(getTOTPTimeRemaining()).toBe(30);

    vi.setSystemTime(new Date('2026-06-10T09:00:29.100Z'));
    expect(getTOTPTimeRemaining()).toBe(1);
  });
});
