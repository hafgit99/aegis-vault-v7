import { useCallback, useEffect, useRef, useState } from 'react';

export type SensitiveRevealKey = 'password' | 'cardNumber' | 'cardCvv' | 'cardPin' | 'passkeyPrivateExponent';

const INITIAL_REVEALED_STATE: Record<SensitiveRevealKey, boolean> = {
  password: false,
  cardNumber: false,
  cardCvv: false,
  cardPin: false,
  passkeyPrivateExponent: false,
};

export function useSensitiveReveal() {
  const [revealed, setRevealed] = useState(INITIAL_REVEALED_STATE);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const toggleReveal = useCallback((key: SensitiveRevealKey) => {
    setRevealed((current) => {
      const nextVal = !current[key];

      // Clear existing timer if any
      if (timers.current[key]) {
        clearTimeout(timers.current[key]);
        delete timers.current[key];
      }

      // If turning ON, set a 15-second timer to auto-hide
      if (nextVal) {
        timers.current[key] = setTimeout(() => {
          setRevealed((curr) => ({
            ...curr,
            [key]: false,
          }));
          delete timers.current[key];
        }, 15_000);
      }

      return {
        ...current,
        [key]: nextVal,
      };
    });
  }, []);

  const resetReveals = useCallback(() => {
    // Clear all active timers
    Object.values(timers.current).forEach(clearTimeout);
    timers.current = {};
    setRevealed(INITIAL_REVEALED_STATE);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  return {
    revealed,
    toggleReveal,
    resetReveals,
  };
}
