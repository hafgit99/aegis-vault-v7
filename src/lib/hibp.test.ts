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
    expect(calls[0][0]).toBe('https://api.pwnedpasswords.com/range/5BAA6');
    expect(calls[0][0]).not.toContain('1E4C9B93F3F0682250B6CF8331B7EE68FD8');
    expect(calls[0][1]).toEqual(expect.objectContaining({
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
});
