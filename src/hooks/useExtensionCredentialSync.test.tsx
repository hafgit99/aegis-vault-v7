// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useExtensionCredentialSync,
} from './useExtensionCredentialSync';

const syncExtensionCredentials = vi.hoisted(() => vi.fn());
const clearExtensionCredentials = vi.hoisted(() => vi.fn());

vi.mock('../lib/desktopStorage', () => ({
  syncExtensionCredentials,
  clearExtensionCredentials,
}));

describe('useExtensionCredentialSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    syncExtensionCredentials.mockReset();
    clearExtensionCredentials.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears cached credentials while locked', () => {
    renderHook(() => useExtensionCredentialSync(false, []));
    expect(clearExtensionCredentials).toHaveBeenCalledTimes(1);
    expect(syncExtensionCredentials).not.toHaveBeenCalled();
  });

  it('syncs immediately and every minute while unlocked', async () => {
    const items = [{ id: 'item-1', title: 'GitHub' } as never];
    renderHook(() => useExtensionCredentialSync(true, items));

    expect(syncExtensionCredentials).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(syncExtensionCredentials).toHaveBeenCalledTimes(3);

    // Unmounting stops the interval.
  });

  it('clears credentials again when the vault locks after being unlocked', () => {
    const { rerender } = renderHook(
      ({ unlocked }) => useExtensionCredentialSync(unlocked, []),
      { initialProps: { unlocked: true } },
    );

    expect(clearExtensionCredentials).not.toHaveBeenCalled();
    rerender({ unlocked: false });
    expect(clearExtensionCredentials).toHaveBeenCalledTimes(1);
  });
});
