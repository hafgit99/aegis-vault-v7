/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkPasswordAgainstHibp, resetHibpCacheForTesting } from './hibp';

describe('HIBP password checks', () => {
  afterEach(() => {
    resetHibpCacheForTesting();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('treats empty passwords as clean without making network requests', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('')).resolves.toEqual({ status: 'clean', count: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores malformed range lines and non-positive counts', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => [
        'MALFORMED',
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:0',
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:not-a-number',
        '00000000000000000000000000000000000:42',
      ].join('\n'),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({ status: 'clean', count: 0 });
  });

  it('returns unavailable for non-successful HIBP responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 503,
      text: async () => '',
    })));

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({
      status: 'unavailable',
      count: 0,
      reason: 'HIBP range request failed with HTTP 503.',
    });
  });

  it('returns unavailable when WebCrypto SHA-1 digest is missing', async () => {
    const originalCrypto = globalThis.crypto;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', {});

    try {
      await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({
        status: 'unavailable',
        count: 0,
        reason: 'WebCrypto SHA-1 digest is not available.',
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('crypto', originalCrypto);
    }
  });

  it('uses k-anonymity range lookup without sending the full password hash', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => [
        '003B7A8757C0B8D478A0F7536F36BD8A2F5:2',
        '1E4C9B93F3F0682250B6CF8331B7EE68FD8:12345',
      ].join('\r\n'),
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({
      status: 'pwned',
      count: 12345,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0]![0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(calls[0]![0]).not.toContain('1E4C9B93F3F0682250B6CF8331B7EE68FD8');
    expect(calls[0]![1]).toEqual(expect.objectContaining({
      cache: 'no-store',
      headers: {
        'Add-Padding': 'true',
      },
    }));
  });

  it('caches prefix responses for repeated range checks', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:99',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({ status: 'pwned', count: 99 });
    await expect(checkPasswordAgainstHibp('password')).resolves.toEqual({ status: 'pwned', count: 99 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns unavailable instead of failing open on network errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));

    await expect(checkPasswordAgainstHibp('password')).resolves.toMatchObject({
      status: 'unavailable',
      count: 0,
    });
  });

  it('evicts expired cache entries after 1 hour TTL', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:99',
    }));
    vi.stubGlobal('fetch', fetchMock);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(3600 * 1000 + 1000);

    await checkPasswordAgainstHibp('password');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('bounds cache size to MAX_CACHE_SIZE and evicts oldest items in FIFO order', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () => '1E4C9B93F3F0682250B6CF8331B7EE68FD8:99',
    }));
    vi.stubGlobal('fetch', fetchMock);

    for (let i = 0; i < 101; i++) {
      await checkPasswordAgainstHibp(`different_password_${i}`);
    }

    expect(fetchMock).toHaveBeenCalledTimes(101);

    fetchMock.mockClear();

    await checkPasswordAgainstHibp('different_password_0');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
