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

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(onLock, durationSeconds * 1000);
    };

    resetTimer();
    ACTIVITY_EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, resetTimer, { passive: true });
    });

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      ACTIVITY_EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, resetTimer);
      });
    };
  }, [durationSeconds, onLock, unlocked]);
}
