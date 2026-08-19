/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsExtensionToken } from './useSettingsExtensionToken';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('useSettingsExtensionToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('does nothing when not in Tauri environment', async () => {
    const { result } = renderHook(() => useSettingsExtensionToken());

    await act(async () => {
      await result.current.handleRotateToken();
    });

    expect(invoke).not.toHaveBeenCalled();
    expect(result.current.tokenRotateStatus).toBe('idle');
  });

  it('rotates pairing token successfully in Tauri desktop runtime', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useSettingsExtensionToken());

    await act(async () => {
      await result.current.handleRotateToken();
    });

    expect(invoke).toHaveBeenCalledWith('rotate_pairing_token');
    expect(result.current.tokenRotateStatus).toBe('success');
    expect(result.current.tokenRotateMessage).toContain('rotated successfully');

    act(() => {
      vi.advanceTimersByTime(6000);
    });

    expect(result.current.tokenRotateStatus).toBe('idle');
    expect(result.current.tokenRotateMessage).toBeNull();
  });

  it('handles token rotation error', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockRejectedValueOnce(new Error('IPC bridge broken'));

    const { result } = renderHook(() => useSettingsExtensionToken());

    await act(async () => {
      await result.current.handleRotateToken();
    });

    expect(result.current.tokenRotateStatus).toBe('error');
    expect(result.current.tokenRotateMessage).toContain('IPC bridge broken');
  });

  it('handles non-error string rejections gracefully', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockRejectedValueOnce('raw string rejection');

    const { result } = renderHook(() => useSettingsExtensionToken());

    await act(async () => {
      await result.current.handleRotateToken();
    });

    expect(result.current.tokenRotateStatus).toBe('error');
    expect(result.current.tokenRotateMessage).toContain('raw string rejection');
  });
});
