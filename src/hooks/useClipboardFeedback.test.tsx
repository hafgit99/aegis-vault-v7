// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipboardFeedback } from './useClipboardFeedback';

describe('useClipboardFeedback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('marks a field as copied and clears it after the delay', () => {
    const { result } = renderHook(() => useClipboardFeedback(2000));

    act(() => {
      result.current.copyText('secret', 'password');
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret');
    expect(result.current.copiedField).toBe('password');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copiedField).toBeNull();
  });

  it('can clear copied feedback immediately', () => {
    const { result } = renderHook(() => useClipboardFeedback(2000));

    act(() => {
      result.current.copyText('secret', 'password');
    });
    act(() => {
      result.current.clearCopiedField();
    });

    expect(result.current.copiedField).toBeNull();
  });
});
