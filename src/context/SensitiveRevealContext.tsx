/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';
import { useSensitiveReveal, type SensitiveRevealKey } from '../hooks/useSensitiveReveal';

interface SensitiveRevealContextValue {
  revealed: Record<SensitiveRevealKey, boolean>;
  toggleReveal: (key: SensitiveRevealKey) => void;
  resetReveals: () => void;
}

const SensitiveRevealContext = createContext<SensitiveRevealContextValue | null>(null);

export function SensitiveRevealProvider({ children }: { children: React.ReactNode }) {
  const value = useSensitiveReveal();
  return (
    <SensitiveRevealContext.Provider value={value}>
      {children}
    </SensitiveRevealContext.Provider>
  );
}

export function useSensitiveRevealContext(): SensitiveRevealContextValue {
  const ctx = useContext(SensitiveRevealContext);
  if (!ctx) {
    // Fallback safe default object if rendered outside provider (e.g. standalone test)
    return {
      revealed: {
        password: false,
        cardNumber: false,
        cardCvv: false,
        cardPin: false,
        passkeyPrivateExponent: false,
      },
      toggleReveal: () => {},
      resetReveals: () => {},
    };
  }
  return ctx;
}
