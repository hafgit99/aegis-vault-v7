import { useCallback, useState } from 'react';

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

  const toggleReveal = useCallback((key: SensitiveRevealKey) => {
    setRevealed((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }, []);

  const resetReveals = useCallback(() => {
    setRevealed(INITIAL_REVEALED_STATE);
  }, []);

  return {
    revealed,
    toggleReveal,
    resetReveals,
  };
}
