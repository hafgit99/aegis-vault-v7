// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutoLock } from './useAutoLock';

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

describe('useAutoLock', () => {
  afterEach(() => {
    vi.useRealTimers();
    setDocumentHidden(false);
  });

  it('calls onLock after the configured idle duration', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 5,
        onLock,
      }),
    );

    vi.advanceTimersByTime(4_999);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('resets the idle timer when activity is detected', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 5,
        onLock,
      }),
    );

    vi.advanceTimersByTime(4_000);
    window.dispatchEvent(new MouseEvent('mousemove'));
    vi.advanceTimersByTime(4_000);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('continues the idle countdown while the document is hidden and locks at the deadline', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 5,
        onLock,
      }),
    );

    vi.advanceTimersByTime(4_000);
    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    // Security: hiding the window must never pause or cancel the auto-lock.
    vi.advanceTimersByTime(60_000);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('locks immediately when the window becomes visible after the deadline passed while hidden', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 5,
        onLock,
      }),
    );

    vi.advanceTimersByTime(4_500);
    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    // Simulate a throttled background timer that never fired: only the wall
    // clock advances past the deadline while the timer callback stays pending.
    vi.setSystemTime(Date.now() + 60_000);
    expect(onLock).not.toHaveBeenCalled();

    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('does not lock early when the timer fires before the wall-clock deadline', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 5,
        onLock,
      }),
    );

    // Simulate a throttled/early timer run: deadline has not passed yet.
    vi.setSystemTime(Date.now() + 2_000);
    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));

    // The remaining time (3s) must still elapse before locking.
    vi.advanceTimersByTime(2_999);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the 2-hour maximum auto-lock ceiling when duration is set to zero', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 0,
        onLock,
      }),
    );

    // durationSeconds: 0 falls back to the maximum ceiling.
    vi.advanceTimersByTime(7199 * 1000);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('does not clamp a user-selected 2-hour duration to a shorter ceiling', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 7200,
        onLock,
      }),
    );

    vi.advanceTimersByTime(7200 * 1000 - 1);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });
});
