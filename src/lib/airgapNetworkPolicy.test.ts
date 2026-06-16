/**
 * @vitest-environment jsdom
 */

import { describe, expect, it, vi } from 'vitest';
import { assertNetworkUrlAllowed, isNetworkUrlAllowed } from './airgapNetworkPolicy';

describe('air-gap network policy', () => {
  it('allows same-origin assets, HIBP range lookups, and Tauri IPC protocols/hosts', () => {
    expect(isNetworkUrlAllowed('/assets/app.js')).toBe(true);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/ABCDE')).toBe(true);
    expect(isNetworkUrlAllowed('ipc://localhost/invoke')).toBe(true);
    expect(isNetworkUrlAllowed('http://ipc.localhost/invoke')).toBe(true);
    expect(isNetworkUrlAllowed('https://tauri.localhost/index.html')).toBe(true);
  });

  it('blocks arbitrary outbound network requests without leaking full paths', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    try {
      expect(() => assertNetworkUrlAllowed('https://telemetry.example.test/collect?secret=abc')).toThrow(
        'air-gap policy',
      );
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'network.blocked',
        source: 'AegisSecurity',
      }));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
