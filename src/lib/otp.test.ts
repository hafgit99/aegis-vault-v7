import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTOTP, getTOTPTimeRemaining } from './otp';

describe('otp helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a safe placeholder when no secret is provided', () => {
    expect(generateTOTP('')).toBe('000 000');
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

  it('reports remaining seconds in the current 30-second cycle', () => {
    vi.useFakeTimers();

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000Z'));
    expect(getTOTPTimeRemaining()).toBe(30);

    vi.setSystemTime(new Date('2026-06-10T09:00:29.100Z'));
    expect(getTOTPTimeRemaining()).toBe(1);
  });
});
