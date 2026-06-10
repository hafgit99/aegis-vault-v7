/**
 * @vitest-environment jsdom
 */

import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useUnlockedVaultRefresh } from './useUnlockedVaultRefresh';

afterEach(() => {
  cleanup();
});

describe('useUnlockedVaultRefresh', () => {
  it('does not refresh while locked', () => {
    const onRefresh = vi.fn();

    renderHook(() => useUnlockedVaultRefresh({ unlocked: false, onRefresh }));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes when unlocked', () => {
    const onRefresh = vi.fn();

    renderHook(() => useUnlockedVaultRefresh({ unlocked: true, onRefresh }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the lock state changes to unlocked', () => {
    const onRefresh = vi.fn();
    const { rerender } = renderHook(
      ({ unlocked }) => useUnlockedVaultRefresh({ unlocked, onRefresh }),
      { initialProps: { unlocked: false } },
    );

    rerender({ unlocked: true });

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
