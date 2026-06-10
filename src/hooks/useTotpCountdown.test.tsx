/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTotpCountdown } from './useTotpCountdown';

vi.mock('../lib/otp', () => ({
  getTOTPTimeRemaining: vi.fn(() => 17),
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useTotpCountdown', () => {
  it('starts with the full cycle duration', () => {
    const { result } = renderHook(() => useTotpCountdown());

    expect(result.current).toBe(30);
  });

  it('updates the countdown every second', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTotpCountdown());

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(result.current).toBe(17);
  });

  it('clears the interval on unmount', () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = renderHook(() => useTotpCountdown());

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });
});
