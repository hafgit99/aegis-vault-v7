// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { enableNativeScreenCaptureProtection } from './nativeSecurity';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe('nativeSecurity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__TAURI_INTERNALS__;
  });

  it('skips native protection outside Tauri', async () => {
    await expect(enableNativeScreenCaptureProtection()).resolves.toBe(false);

    expect(invoke).not.toHaveBeenCalled();
  });

  it('enables native screen capture protection in Tauri', async () => {
    window.__TAURI_INTERNALS__ = {};
    invoke.mockResolvedValueOnce(true);

    await expect(enableNativeScreenCaptureProtection()).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith('enable_screen_capture_protection');
  });

  it('returns false when the native command is unavailable', async () => {
    window.__TAURI_INTERNALS__ = {};
    invoke.mockRejectedValueOnce(new Error('unsupported'));

    await expect(enableNativeScreenCaptureProtection()).resolves.toBe(false);
  });
});
