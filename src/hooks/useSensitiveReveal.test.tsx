// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSensitiveReveal } from './useSensitiveReveal';

describe('useSensitiveReveal', () => {
  it('toggles sensitive field reveal state independently', () => {
    const { result } = renderHook(() => useSensitiveReveal());

    act(() => {
      result.current.toggleReveal('password');
      result.current.toggleReveal('cardCvv');
    });

    expect(result.current.revealed.password).toBe(true);
    expect(result.current.revealed.cardCvv).toBe(true);
    expect(result.current.revealed.cardNumber).toBe(false);
  });

  it('resets all reveal state', () => {
    const { result } = renderHook(() => useSensitiveReveal());

    act(() => {
      result.current.toggleReveal('password');
      result.current.toggleReveal('cardPin');
    });
    act(() => {
      result.current.resetReveals();
    });

    expect(Object.values(result.current.revealed).every((value) => value === false)).toBe(true);
  });

  it('automatically hides the revealed field after 15 seconds', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSensitiveReveal());

    act(() => {
      result.current.toggleReveal('password');
    });
    expect(result.current.revealed.password).toBe(true);

    act(() => {
      vi.advanceTimersByTime(14_999);
    });
    expect(result.current.revealed.password).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.revealed.password).toBe(false);

    vi.useRealTimers();
  });

  it('clears existing timer when toggled off before auto-hide', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSensitiveReveal());

    act(() => {
      result.current.toggleReveal('password');
    });
    expect(result.current.revealed.password).toBe(true);

    act(() => {
      result.current.toggleReveal('password');
    });
    expect(result.current.revealed.password).toBe(false);

    // Verify timer was cleared and won't throw/re-hide or do anything unexpected
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(result.current.revealed.password).toBe(false);

    vi.useRealTimers();
  });

  it('clears active timers on unmount', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useSensitiveReveal());

    act(() => {
      result.current.toggleReveal('password');
    });

    // Unmount hook, triggering cleanup
    unmount();

    vi.useRealTimers();
  });
});
