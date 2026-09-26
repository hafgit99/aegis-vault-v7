// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRuntimeSecurity } from './useRuntimeSecurity';
import { enableNativeScreenCaptureProtection } from '../lib/nativeSecurity';

vi.mock('../lib/nativeSecurity', () => ({
  enableNativeScreenCaptureProtection: vi.fn(async () => true),
}));

let eventListenerCallback: ((event: { payload: boolean }) => void) | null = null;
const listenMock = vi.fn().mockImplementation((eventName: string, callback: (event: any) => void) => {
  if (eventName === 'screen-capture-status-changed') {
    eventListenerCallback = callback;
  }
  return Promise.resolve(vi.fn());
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: (...args: any[]) => listenMock(...args),
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
    eventListenerCallback = null;
    (window as any).__TAURI_INTERNALS__ = {};
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    setDocumentHidden(false);
    delete (window as any).__TAURI_INTERNALS__;
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

  it('does not raise the privacy shield during Android Autofill mode', () => {
    const onLock = vi.fn();
    const onSensitiveStateClear = vi.fn();
    const { result } = renderHook(() =>
      useRuntimeSecurity({
        unlocked: true,
        onLock,
        onSensitiveStateClear,
        backgroundLockDelayMs: 5_000,
        isAutofillMode: true,
      }),
    );

    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('blur'));
      vi.advanceTimersByTime(5_000);
    });

    expect(result.current.privacyShieldVisible).toBe(false);
    expect(onSensitiveStateClear).not.toHaveBeenCalled();
    expect(onLock).not.toHaveBeenCalled();
  });

  it('REGRESSION (N-1): does not lock on foreground return when no background deadline was armed', () => {
    // The Autofill flow re-launches the Activity, which fires
    // visibilitychange with document.hidden = true. shieldAndScheduleLock()
    // intentionally returns early in autofill mode so the user does not see a
    // black screen — which means no deadline is ever armed. When the flow
    // completes the app returns to the foreground; that transition must not be
    // mistaken for "the background deadline elapsed".
    const onLock = vi.fn();
    const { result, rerender } = renderHook(
      ({ isAutofillMode }: { isAutofillMode: boolean }) =>
        useRuntimeSecurity({
          unlocked: true,
          onLock,
          onSensitiveStateClear: vi.fn(),
          backgroundLockDelayMs: 5_000,
          isAutofillMode,
        }),
      { initialProps: { isAutofillMode: true } },
    );

    // Backgrounded mid-autofill: shield suppressed, no lock timer armed.
    act(() => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current.privacyShieldVisible).toBe(false);
    expect(onLock).not.toHaveBeenCalled();

    // Autofill completes; the app is foregrounded again.
    act(() => {
      rerender({ isAutofillMode: false });
      setDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(60_000);
    });

    expect(onLock).not.toHaveBeenCalled();
  });

  it('REGRESSION (N-1): still locks when a real background deadline elapsed while hidden', () => {
    // Counterpart to the case above: the deadline WAS armed, the browser
    // throttled the timer while hidden, and the user returns after it elapsed.
    // The vault must lock — that is the Y-6 behaviour being protected.
    const onLock = vi.fn();
    renderHook(() =>
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

    // Hidden for longer than the configured delay. setSystemTime moves the
    // wall clock WITHOUT firing pending timers, which is exactly how a
    // throttled/suspended background timer behaves in a real browser.
    act(() => {
      vi.setSystemTime(Date.now() + 6_000);
    });

    act(() => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('REGRESSION (N-1): a foreground transition without a prior hide does not lock', () => {
    const onLock = vi.fn();
    renderHook(() =>
      useRuntimeSecurity({
        unlocked: true,
        onLock,
        onSensitiveStateClear: vi.fn(),
        backgroundLockDelayMs: 5_000,
      }),
    );

    act(() => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(60_000);
    });

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

  it('shields the screen and clears sensitive state when screen capture is detected via tauri event', async () => {
    const onLock = vi.fn();
    const onSensitiveStateClear = vi.fn();
    
    const { result } = renderHook(() =>
      useRuntimeSecurity({
        unlocked: true,
        onLock,
        onSensitiveStateClear,
      }),
    );

    expect(listenMock).toHaveBeenCalledWith('screen-capture-status-changed', expect.any(Function));
    expect(eventListenerCallback).not.toBeNull();

    // Trigger screen recording detected (payload = true)
    await act(async () => {
      if (eventListenerCallback) {
        eventListenerCallback({ payload: true });
      }
    });

    expect(result.current.privacyShieldVisible).toBe(true);
    expect(result.current.screenRecordingDetected).toBe(true);
    expect(onSensitiveStateClear).toHaveBeenCalledTimes(1);
    expect(onLock).toHaveBeenCalledTimes(1);

    // Trigger screen recording stopped (payload = false)
    await act(async () => {
      if (eventListenerCallback) {
        eventListenerCallback({ payload: false });
      }
    });

    expect(result.current.privacyShieldVisible).toBe(false);
    expect(result.current.screenRecordingDetected).toBe(false);
  });
});
