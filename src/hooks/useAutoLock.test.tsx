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

  it('pauses the idle timer while the document is hidden', () => {
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
    vi.advanceTimersByTime(60_000);
    expect(onLock).not.toHaveBeenCalled();

    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(4_999);
    expect(onLock).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onLock).toHaveBeenCalledTimes(1);
  });

  it('does not lock when disabled with duration zero', () => {
    vi.useFakeTimers();
    const onLock = vi.fn();

    renderHook(() =>
      useAutoLock({
        unlocked: true,
        durationSeconds: 0,
        onLock,
      }),
    );

    vi.advanceTimersByTime(60_000);
    expect(onLock).not.toHaveBeenCalled();
  });
});
