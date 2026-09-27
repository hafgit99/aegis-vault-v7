/**
 * @file useAutoSnapshotScheduler.ts
 * @description K-7 — drives the `interval` context of the automatic snapshot
 * scheduler so `daily` / `weekly` frequencies are not evaluated only at lock
 * time.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef } from 'react';

import { checkAndTriggerAutoSnapshot } from '../lib/snapshots';

/**
 * How often the scheduler wakes up to ask "is a daily/weekly snapshot due?".
 *
 * 60 s is deliberate: the check itself is a settings read plus a date compare
 * (`shouldTriggerAutoSnapshot`), so it is cheap, and it bounds the worst-case
 * lateness of a due snapshot to one minute instead of "whenever the user next
 * happens to lock the vault".
 */
export const AUTO_SNAPSHOT_INTERVAL_MS = 60 * 1000;

interface UseAutoSnapshotSchedulerOptions {
  /** Snapshots need live session secrets, so the scheduler only runs while unlocked. */
  unlocked: boolean;
  /** Set false in tests or when the host throttles timers. */
  enabled?: boolean;
  intervalMs?: number;
}

/**
 * K-7: the `interval` context existed and was unit-tested, but nothing in
 * production ever passed it. `checkAndTriggerAutoSnapshot('lock')` is wired in
 * `useVaultLock`, so with `frequency: 'daily'` a user who unlocked the vault
 * and never locked it again got **no automatic snapshot at all** — the setting
 * was a fully working control surface with no effect, which is the same
 * "published UI with no backing code" pattern the review flagged elsewhere.
 *
 * Three wake-up sources, because any one of them alone has a hole:
 *  - an interval, for the ordinary case;
 *  - an immediate run when the vault is (re)opened, so unlocking after a long
 *    absence captures a due snapshot without waiting for the first tick;
 *  - a `visibilitychange` back-to-foreground run, because browsers and WebViews
 *    throttle or suspend timers in background tabs and on sleep. Without this,
 *    a laptop that was asleep for a day would skip its daily snapshot — the
 *    same defect class as Y-6/N-1, where a suspended background timer was
 *    treated as "nothing was pending".
 */
export function useAutoSnapshotScheduler({
  unlocked,
  enabled = true,
  intervalMs = AUTO_SNAPSHOT_INTERVAL_MS,
}: UseAutoSnapshotSchedulerOptions): void {
  // Serialises overlapping runs. A snapshot capture is async and can outlive
  // the interval, and two concurrent captures of the same vault session would
  // race on the retention prune and on `lastAutoSnapshotTime`.
  const inFlightRef = useRef(false);

  const runDueSnapshot = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      // Failures are swallowed inside checkAndTriggerAutoSnapshot (resolves to
      // null); a failed automatic backup must never surface as an app error.
      await checkAndTriggerAutoSnapshot('interval');
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled || !unlocked) return;
    if (typeof document === 'undefined') return;

    // Cover the "was asleep / backgrounded past the deadline" case.
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void runDueSnapshot();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    void runDueSnapshot();
    const timer = setInterval(() => {
      void runDueSnapshot();
    }, intervalMs);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, unlocked, intervalMs, runDueSnapshot]);
}
