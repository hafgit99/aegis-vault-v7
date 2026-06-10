// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useClipboardFeedback } from './useClipboardFeedback';

describe('useClipboardFeedback', () => {
  let clipboardText = '';
  let readText: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    clipboardText = '';
    readText = vi.fn().mockImplementation(() => Promise.resolve(clipboardText));
    writeText = vi.fn().mockImplementation((text: string) => {
      clipboardText = text;
      return Promise.resolve();
    });
    Object.assign(navigator, {
      clipboard: {
        readText,
        writeText,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('marks a field as copied and clears it after the delay', () => {
    const { result } = renderHook(() => useClipboardFeedback(2000, 30000));

    act(() => {
      result.current.copyText('secret', 'password');
    });

    expect(writeText).toHaveBeenCalledWith('secret');
    expect(result.current.copiedField).toBe('password');

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(result.current.copiedField).toBeNull();
  });

  it('clears the clipboard after the secure clear delay when unchanged', async () => {
    const { result } = renderHook(() => useClipboardFeedback(2000, 30000));

    act(() => {
      result.current.copyText('secret', 'password');
    });

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenLastCalledWith('');
    expect(clipboardText).toBe('');
  });

  it('does not clear the clipboard when the user copied something else', async () => {
    const { result } = renderHook(() => useClipboardFeedback(2000, 30000));

    act(() => {
      result.current.copyText('secret', 'password');
    });
    clipboardText = 'new clipboard value';

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(readText).toHaveBeenCalled();
    expect(writeText).not.toHaveBeenLastCalledWith('');
    expect(clipboardText).toBe('new clipboard value');
  });

  it('can clear copied feedback and unchanged clipboard immediately', async () => {
    const { result } = renderHook(() => useClipboardFeedback(2000, 30000));

    act(() => {
      result.current.copyText('secret', 'password');
    });

    await act(async () => {
      result.current.clearCopiedField();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenLastCalledWith('');
    expect(result.current.copiedField).toBeNull();
  });
});
