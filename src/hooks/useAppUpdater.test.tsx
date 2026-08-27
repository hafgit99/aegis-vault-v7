/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppUpdater } from './useAppUpdater';
import * as updaterLib from '../lib/updater';

vi.mock('../lib/environment', () => ({
  isDesktopAppUpdaterSupported: vi.fn(() => true),
  isDesktopRuntime: vi.fn(() => true),
  isAndroidRuntime: vi.fn(() => false),
}));

describe('useAppUpdater hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts with initial idle status', () => {
    const { result } = renderHook(() => useAppUpdater());

    expect(result.current.status).toBe('idle');
    expect(result.current.supported).toBe(true);
    expect(result.current.updateInfo).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('updates status to upToDate when no update exists', async () => {
    vi.spyOn(updaterLib, 'checkAppUpdate').mockResolvedValueOnce({
      supported: true,
      hasUpdate: false,
    });

    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.status).toBe('upToDate');
    expect(result.current.updateInfo).toBeNull();
  });

  it('updates status to available with updateInfo when update is available', async () => {
    const mockInfo = {
      currentVersion: '7.0.2',
      version: '7.0.3',
      body: 'Bug fixes',
      date: '2026-08-27',
    };

    vi.spyOn(updaterLib, 'checkAppUpdate').mockResolvedValueOnce({
      supported: true,
      hasUpdate: true,
      updateInfo: mockInfo,
    });

    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.checkForUpdates();
    });

    expect(result.current.status).toBe('available');
    expect(result.current.updateInfo).toEqual(mockInfo);
  });

  it('handles download and install lifecycle', async () => {
    vi.spyOn(updaterLib, 'downloadAndApplyUpdate').mockImplementation(async (onProgress) => {
      onProgress?.({ total: 500, downloaded: 250, percent: 50 });
      return { success: true };
    });

    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.installUpdate();
    });

    expect(result.current.status).toBe('downloaded');
    expect(result.current.progress.percent).toBe(50);
  });

  it('handles download failure with error status', async () => {
    vi.spyOn(updaterLib, 'downloadAndApplyUpdate').mockResolvedValueOnce({
      success: false,
      error: 'Disk full error',
    });

    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.installUpdate();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('Disk full error');
  });

  it('calls restartApplication on restartNow', async () => {
    const restartSpy = vi.spyOn(updaterLib, 'restartApplication').mockResolvedValueOnce();
    const { result } = renderHook(() => useAppUpdater());

    await act(async () => {
      await result.current.restartNow();
    });

    expect(restartSpy).toHaveBeenCalled();
  });
});
