/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The scheduler reaches into real storage through the snapshot pipeline, so the
// trigger is mocked and the assertions are about the *call pattern* — which is
// exactly what K-7 was about: the `interval` context had no production caller.
vi.mock('../lib/snapshots', () => ({
  checkAndTriggerAutoSnapshot: vi.fn().mockResolvedValue(null),
}));

import { checkAndTriggerAutoSnapshot } from '../lib/snapshots';
import { AUTO_SNAPSHOT_INTERVAL_MS, useAutoSnapshotScheduler } from './useAutoSnapshotScheduler';

function setDocumentHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

const triggerMock = vi.mocked(checkAndTriggerAutoSnapshot);

/**
 * `runDueSnapshot` awaits the trigger, and the in-flight guard stays closed
 * until that settles. Under fake timers a synchronous `act()` does not flush
 * microtasks, so without this the first (mount-time) run would still hold the
 * guard and every later tick would look skipped.
 */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAutoSnapshotScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentHidden(false);
    triggerMock.mockClear();
    triggerMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    setDocumentHidden(false);
    cleanup();
  });

  it('runs the interval context immediately when the vault is unlocked', () => {
    // A user who unlocks after more than a day must not have to wait for the
    // first tick — or for a lock they may never perform.
    renderHook(() => useAutoSnapshotScheduler({ unlocked: true }));

    expect(triggerMock).toHaveBeenCalledTimes(1);
    expect(triggerMock).toHaveBeenCalledWith('interval');
  });

  it('keeps polling on the interval while unlocked (K-7)', async () => {
    renderHook(() => useAutoSnapshotScheduler({ unlocked: true }));
    await flush();
    triggerMock.mockClear();

    // Advanced one period at a time, with a microtask flush between, because
    // that is what real time looks like: a capture settles long before the
    // next 60 s tick. Firing all three ticks in one synchronous advance would
    // legitimately collapse into a single run (see the overlap test below).
    for (let tick = 0; tick < 3; tick += 1) {
      await act(async () => {
        vi.advanceTimersByTime(AUTO_SNAPSHOT_INTERVAL_MS);
        await Promise.resolve();
      });
    }

    expect(triggerMock).toHaveBeenCalledTimes(3);
    expect(triggerMock).toHaveBeenLastCalledWith('interval');
  });

  it('does not run at all while the vault is locked', () => {
    renderHook(() => useAutoSnapshotScheduler({ unlocked: false }));

    act(() => {
      vi.advanceTimersByTime(AUTO_SNAPSHOT_INTERVAL_MS * 5);
    });

    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('stops polling and does not run on lock', async () => {
    const { rerender } = renderHook(
      ({ unlocked }: { unlocked: boolean }) => useAutoSnapshotScheduler({ unlocked }),
      { initialProps: { unlocked: true } },
    );
    await flush();
    triggerMock.mockClear();

    rerender({ unlocked: false });
    await act(async () => {
      vi.advanceTimersByTime(AUTO_SNAPSHOT_INTERVAL_MS * 5);
      await Promise.resolve();
    });

    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('re-evaluates on foreground return, because background timers get throttled', async () => {
    // Y-6/N-1 defect class: a suspended or throttled interval must not be
    // treated as "nothing was due". A laptop asleep overnight would otherwise
    // skip its daily snapshot entirely.
    renderHook(() => useAutoSnapshotScheduler({ unlocked: true }));
    await flush();
    triggerMock.mockClear();

    await act(async () => {
      setDocumentHidden(true);
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(triggerMock).not.toHaveBeenCalled();

    await act(async () => {
      setDocumentHidden(false);
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(triggerMock).toHaveBeenCalledTimes(1);
    expect(triggerMock).toHaveBeenLastCalledWith('interval');
  });

  it('clears the interval on unmount', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useAutoSnapshotScheduler({ unlocked: true }));
    await flush();
    const before = clearSpy.mock.calls.length;

    unmount();
    await flush();
    triggerMock.mockClear();

    await act(async () => {
      vi.advanceTimersByTime(AUTO_SNAPSHOT_INTERVAL_MS * 3);
      await Promise.resolve();
    });

    expect(clearSpy.mock.calls.length).toBeGreaterThan(before);
    expect(triggerMock).not.toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it('does not overlap captures when one run outlives the interval', async () => {
    let release: (() => void) | null = null;
    triggerMock.mockImplementation(() => new Promise<null>((resolve) => {
      release = () => resolve(null);
    }));

    renderHook(() => useAutoSnapshotScheduler({ unlocked: true, intervalMs: 1_000 }));
    expect(triggerMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    // Still one: the first capture has not settled yet.
    expect(triggerMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release?.();
      await Promise.resolve();
    });

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(triggerMock).toHaveBeenCalledTimes(2);
  });
});
