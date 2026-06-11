import { afterEach, describe, expect, it, vi } from 'vitest';
import { secureRandomBytes, secureRandomId, secureRandomIndex, secureRandomToken } from './random';

describe('random helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('creates random byte arrays with the requested length', () => {
    expect(secureRandomBytes(16)).toHaveLength(16);
    expect(secureRandomBytes(0)).toHaveLength(0);
  });

  it('normalizes negative byte lengths to an empty array', () => {
    expect(secureRandomBytes(-10)).toHaveLength(0);
  });

  it('fails closed when WebCrypto random values are unavailable', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.stubGlobal('crypto', {});

    expect(() => secureRandomBytes(3)).toThrow('CSPRNG not available');
    expect(() => secureRandomIndex(10)).toThrow('CSPRNG not available');
  });

  it('returns indexes inside the requested range', () => {
    for (let i = 0; i < 100; i++) {
      const value = secureRandomIndex(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
  });

  it('returns zero for non-positive index ranges', () => {
    expect(secureRandomIndex(0)).toBe(0);
    expect(secureRandomIndex(-1)).toBe(0);
  });

  it('retries random indexes that fall outside the unbiased range', () => {
    const getRandomValues = vi
      .fn()
      .mockImplementationOnce((array: Uint32Array) => {
        array[0] = 0xffffffff;
        return array;
      })
      .mockImplementationOnce((array: Uint32Array) => {
        array[0] = 8;
        return array;
      });
    vi.stubGlobal('crypto', { getRandomValues });

    expect(secureRandomIndex(10)).toBe(8);
    expect(getRandomValues).toHaveBeenCalledTimes(2);
  });

  it('creates usable ids and tokens', () => {
    expect(secureRandomId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(secureRandomToken(9)).toMatch(/^[0-9a-z]{9}$/);
  });

  it('uses randomUUID when available for ids', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
    });

    expect(secureRandomId()).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('formats fallback ids as version 4 UUIDs', () => {
    const getRandomValues = vi.fn((array: Uint8Array) => {
      array.fill(0xff);
      return array;
    });
    vi.stubGlobal('crypto', { getRandomValues });

    expect(secureRandomId()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('creates an empty token when the requested token length is zero', () => {
    expect(secureRandomToken(0)).toBe('');
  });
});
