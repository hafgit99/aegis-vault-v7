// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRuntimeSecurity } from './useRuntimeSecurity';
import { enableNativeScreenCaptureProtection } from '../lib/nativeSecurity';

vi.mock('../lib/nativeSecurity', () => ({
  enableNativeScreenCaptureProtection: vi.fn(async () => true),
}));

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

describe('useRuntimeSecurity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    setDocumentHidden(false);
  });

  it('enables native screen capture protection on mount', () => {
    renderHook(() =>
      useRuntimeSecurity({
        unlocked: false,
        onLock: vi.fn(),
        onSensitiveStateClear: vi.fn(),
      }),
    );

    expect(enableNativeScreenCaptureProtection).toHaveBeenCalledTimes(1);
  });

  it('shields the screen and locks after the app stays hidden', () => {
    const onLock = vi.fn();
    const onSensitiveStateClear = vi.fn();
    const { result } = renderHook(() =>
      useRuntimeSecurity({
        unlocked: true,
        onLock,
        onSensitiveStateClear,
        backgroundLockDelayMs: 5_000,
      }),
    );

    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.privacyShieldVisible).toBe(true);
    expect(onSensitiveStateClear).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(onLock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('removes the shield and cancels the lock when the app becomes visible again', () => {
    const onLock = vi.fn();
    const { result } = renderHook(() =>
      useRuntimeSecurity({
        unlocked: true,
        onLock,
        onSensitiveStateClear: vi.fn(),
        backgroundLockDelayMs: 5_000,
      }),
    );

    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.privacyShieldVisible).toBe(true);

    act(() => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.privacyShieldVisible).toBe(false);
    expect(onLock).not.toHaveBeenCalled();
  });

  it('shields and clears sensitive state on window blur', () => {
    const onSensitiveStateClear = vi.fn();
    const { result } = renderHook(() =>
      useRuntimeSecurity({
        unlocked: true,
        onLock: vi.fn(),
        onSensitiveStateClear,
      }),
    );

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.privacyShieldVisible).toBe(true);
    expect(onSensitiveStateClear).toHaveBeenCalledTimes(1);
  });
});
