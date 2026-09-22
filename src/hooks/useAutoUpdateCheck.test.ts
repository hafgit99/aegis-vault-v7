/**
 * @vitest-environment jsdom
 */

import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as updater from '../lib/updater';
import * as environment from '../lib/environment';
import { useAutoUpdateCheck } from './useAutoUpdateCheck';

describe('useAutoUpdateCheck', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    vi.spyOn(environment, 'isDesktopAppUpdaterSupported').mockReturnValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('initializes with default hidden state', () => {
    const { result } = renderHook(() => useAutoUpdateCheck(false));

    expect(result.current.isVisible).toBe(false);
    expect(result.current.updateInfo).toBeNull();
    expect(result.current.isDownloading).toBe(false);
  });

  it('checks for update after 5 seconds delay when enabled', async () => {
    const checkSpy = vi.spyOn(updater, 'checkAppUpdate').mockResolvedValue({
      supported: true,
      hasUpdate: true,
      updateInfo: {
        currentVersion: '7.0.6.0',
        version: '7.1.0.0',
      },
    });

    const { result } = renderHook(() => useAutoUpdateCheck(true));

    expect(checkSpy).not.toHaveBeenCalled();

    // Advance 5 seconds
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(result.current.isVisible).toBe(true);
    expect(result.current.updateInfo?.version).toBe('7.1.0.0');
  });

  it('dismisses banner when dismissBanner is called', async () => {
    vi.spyOn(updater, 'checkAppUpdate').mockResolvedValue({
      supported: true,
      hasUpdate: true,
      updateInfo: {
        currentVersion: '7.0.6.0',
        version: '7.1.0.0',
      },
    });

    const { result } = renderHook(() => useAutoUpdateCheck(true));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.dismissBanner();
    });

    expect(result.current.isVisible).toBe(false);
  });
});
