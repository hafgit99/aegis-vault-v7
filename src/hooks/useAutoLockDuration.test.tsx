/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useAutoLockDuration } from './useAutoLockDuration';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useAutoLockDuration', () => {
  it('uses five minutes by default', () => {
    const { result } = renderHook(() => useAutoLockDuration());

    expect(result.current.autoLockDuration).toBe(300);
  });

  it('hydrates the duration from localStorage', () => {
    localStorage.setItem('auto_lock_duration', '900');

    const { result } = renderHook(() => useAutoLockDuration());

    expect(result.current.autoLockDuration).toBe(900);
  });

  it('falls back to the default when storage is invalid', () => {
    localStorage.setItem('auto_lock_duration', 'later');

    const { result } = renderHook(() => useAutoLockDuration());

    expect(result.current.autoLockDuration).toBe(300);
  });

  it('saves duration changes to state and localStorage within safe bounds', () => {
    const { result } = renderHook(() => useAutoLockDuration());

    act(() => result.current.changeAutoLockDuration(7200));

    expect(result.current.autoLockDuration).toBe(7200);
    expect(localStorage.getItem('auto_lock_duration')).toBe('7200');
  });

  it('sanitizes zero or negative duration to default', () => {
    const { result } = renderHook(() => useAutoLockDuration());

    act(() => result.current.changeAutoLockDuration(0));

    expect(result.current.autoLockDuration).toBe(300);
    expect(localStorage.getItem('auto_lock_duration')).toBe('300');
  });
});
