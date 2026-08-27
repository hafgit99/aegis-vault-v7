import { useEffect } from 'react';

interface UseAutoLockOptions {
  unlocked: boolean;
  durationSeconds: number;
  onLock: () => void;
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export const MAXIMUM_AUTO_LOCK_DURATION_SECONDS = 7200; // 2 hours maximum ceiling (matches useAutoLockDuration + docs "15s–2h")

export function useAutoLock({ unlocked, durationSeconds, onLock }: UseAutoLockOptions) {
  const effectiveDurationSeconds =
    durationSeconds > 0 && durationSeconds <= MAXIMUM_AUTO_LOCK_DURATION_SECONDS
      ? durationSeconds
      : MAXIMUM_AUTO_LOCK_DURATION_SECONDS;

  useEffect(() => {
    if (!unlocked) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let deadline = Date.now() + effectiveDurationSeconds * 1000;
    let fired = false;

    const clearTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const fireLock = () => {
      if (fired) return;
      fired = true;
      clearTimer();
      onLock();
    };

    // Arms a timer for the remaining wall-clock time. Background throttling may
    // fire the callback early or late; the deadline check keeps the lock honest.
    const armTimer = () => {
      clearTimer();
      const remainingMs = Math.max(0, deadline - Date.now());
      timeoutId = setTimeout(() => {
        if (Date.now() >= deadline) {
          fireLock();
        } else {
          armTimer();
        }
      }, remainingMs);
    };

    const resetTimer = () => {
      fired = false;
      deadline = Date.now() + effectiveDurationSeconds * 1000;
      armTimer();
    };

    const handleVisibilityChange = () => {
      // Security: the deadline is NEVER cancelled while hidden. A vault that
      // pauses its auto-lock when the window is hidden can stay unlocked
      // indefinitely, so the countdown continues regardless of visibility.
      if (document.hidden) return;
      if (Date.now() >= deadline) {
        // Timers can be throttled (or suspended) while hidden; enforce the
        // passed deadline immediately when the window becomes visible again.
        fireLock();
        return;
      }
      armTimer();
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimer();
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [durationSeconds, effectiveDurationSeconds, onLock, unlocked]);
}
