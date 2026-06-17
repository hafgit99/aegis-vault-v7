/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertNetworkUrlAllowed, isNetworkUrlAllowed } from './airgapNetworkPolicy';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('air-gap network policy', () => {
  it('allows same-origin assets, HIBP range lookups, and Tauri IPC protocols/hosts', () => {
    expect(isNetworkUrlAllowed('/assets/app.js')).toBe(true);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/ABCDE')).toBe(true);
    expect(isNetworkUrlAllowed('ipc://localhost/invoke')).toBe(true);
    expect(isNetworkUrlAllowed('http://ipc.localhost/invoke')).toBe(true);
    expect(isNetworkUrlAllowed('https://tauri.localhost/index.html')).toBe(true);
  });

  it('only allows exact HIBP five-character SHA-1 range lookups', () => {
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/5BAA6')).toBe(true);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/5baa6')).toBe(true);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/5BAA')).toBe(false);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/5BAA61')).toBe(false);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/5BAA6/extra')).toBe(false);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/5BAA6?mode=ntlm')).toBe(false);
    expect(isNetworkUrlAllowed('https://api.pwnedpasswords.com/range/ZZZZZ')).toBe(false);
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

  it('guards sendBeacon after policy installation', async () => {
    const nativeSendBeacon = vi.fn(() => true);
    Object.defineProperty(window.navigator, 'sendBeacon', {
      configurable: true,
      writable: true,
      value: nativeSendBeacon,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { installAirgapNetworkPolicy } = await import('./airgapNetworkPolicy');

    installAirgapNetworkPolicy();

    expect(window.navigator.sendBeacon('/local-event')).toBe(true);
    expect(nativeSendBeacon).toHaveBeenCalledWith('/local-event', undefined);
    expect(() => window.navigator.sendBeacon('https://telemetry.example.test/collect')).toThrow('air-gap policy');
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
      code: 'network.blocked',
      source: 'AegisSecurity',
    }));
  });

  it('guards EventSource after policy installation', async () => {
    const nativeEventSource = vi.fn(function EventSourceMock(this: any, url: string | URL) {
      this.url = String(url);
    });
    vi.stubGlobal('EventSource', nativeEventSource);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { installAirgapNetworkPolicy } = await import('./airgapNetworkPolicy');

    installAirgapNetworkPolicy();

    const allowed = new EventSource('https://api.pwnedpasswords.com/range/ABCDE');
    expect((allowed as unknown as { url: string }).url).toBe('https://api.pwnedpasswords.com/range/ABCDE');
    expect(nativeEventSource).toHaveBeenCalledTimes(1);
    expect(() => new EventSource('https://events.example.test/stream')).toThrow('air-gap policy');
    expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({
      code: 'network.blocked',
      source: 'AegisSecurity',
    }));
  });
});
