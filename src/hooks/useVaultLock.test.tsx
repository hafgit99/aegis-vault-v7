/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeVaultSession, hasActiveMasterPassword, openVaultSession } from '../lib/vaultSession';
import { useVaultLock } from './useVaultLock';

afterEach(() => {
  closeVaultSession();
  cleanup();
  vi.useRealTimers();
});

describe('useVaultLock', () => {
  it('starts locked and reflects active vault session status', () => {
    const { result } = renderHook(() =>
      useVaultLock({
        autoLockDuration: 300,
        resetReveals: vi.fn(),
        clearCopiedField: vi.fn(),
      }),
    );

    expect(result.current.unlocked).toBe(false);

    act(() => {
      openVaultSession('master-pass');
    });

    expect(result.current.unlocked).toBe(true);
  });

  it('locks manually and clears sensitive UI state', () => {
    const resetReveals = vi.fn();
    const clearCopiedField = vi.fn();
    openVaultSession('master-pass');
    const { result } = renderHook(() =>
      useVaultLock({
        autoLockDuration: 300,
        resetReveals,
        clearCopiedField,
      }),
    );

    expect(result.current.unlocked).toBe(true);
    act(() => result.current.lock());

    expect(result.current.unlocked).toBe(false);
    expect(hasActiveMasterPassword()).toBe(false);
    expect(resetReveals).toHaveBeenCalledTimes(1);
    expect(clearCopiedField).toHaveBeenCalledTimes(1);
  });

  it('auto-locks after the configured idle duration', () => {
    vi.useFakeTimers();
    const resetReveals = vi.fn();
    const clearCopiedField = vi.fn();
    openVaultSession('master-pass');
    const { result } = renderHook(() =>
      useVaultLock({
        autoLockDuration: 5,
        resetReveals,
        clearCopiedField,
      }),
    );

    expect(result.current.unlocked).toBe(true);
    act(() => vi.advanceTimersByTime(5_000));

    expect(result.current.unlocked).toBe(false);
    expect(hasActiveMasterPassword()).toBe(false);
    expect(resetReveals).toHaveBeenCalledTimes(1);
    expect(clearCopiedField).toHaveBeenCalledTimes(1);
  });
});
