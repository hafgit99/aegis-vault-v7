import { describe, expect, it } from 'vitest';
import { secureRandomBytes, secureRandomId, secureRandomIndex, secureRandomToken } from './random';

describe('random helpers', () => {
  it('creates random byte arrays with the requested length', () => {
    expect(secureRandomBytes(16)).toHaveLength(16);
    expect(secureRandomBytes(0)).toHaveLength(0);
  });

  it('returns indexes inside the requested range', () => {
    for (let i = 0; i < 100; i++) {
      const value = secureRandomIndex(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it('creates usable ids and tokens', () => {
    expect(secureRandomId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(secureRandomToken(9)).toMatch(/^[0-9a-z]{9}$/);
  });
});
