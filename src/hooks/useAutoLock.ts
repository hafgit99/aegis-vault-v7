import { useEffect } from 'react';

interface UseAutoLockOptions {
  unlocked: boolean;
  durationSeconds: number;
  onLock: () => void;
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const;

export function useAutoLock({ unlocked, durationSeconds, onLock }: UseAutoLockOptions) {
  useEffect(() => {
    if (!unlocked) return;
    if (durationSeconds === 0) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = undefined;
      }
    };

    const resetTimer = () => {
      clearTimer();
      if (document.hidden) return;
      timeoutId = setTimeout(onLock, durationSeconds * 1000);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        clearTimer();
      } else {
        resetTimer();
      }
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
  }, [durationSeconds, onLock, unlocked]);
}
