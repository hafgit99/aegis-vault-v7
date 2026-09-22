/**
 * @file useOnboardingTour.ts
 * @description Hook managing the 4-step onboarding checklist for new users.
 * Persists step completion and dismissal states in localStorage.
 *
 * @license Apache-2.0
 */

import { useState, useCallback, useMemo } from 'react';
import type { VaultItem } from '../types';

export const ONBOARDING_STORAGE_KEYS = {
  DISMISSED: 'aegis_onboarding_dismissed',
  EXT_EXPLORED: 'aegis_onboarding_ext_explored',
  EMERGENCY_KIT_DONE: 'aegis_onboarding_emergency_kit_done',
  AUDIT_DONE: 'aegis_onboarding_audit_done',
} as const;

export interface OnboardingStepState {
  id: 1 | 2 | 3 | 4;
  isComplete: boolean;
}

export interface UseOnboardingTourResult {
  isVisible: boolean;
  completedCount: number;
  totalSteps: number;
  steps: OnboardingStepState[];
  dismissTour: () => void;
  markStepComplete: (stepId: 1 | 2 | 3 | 4) => void;
  resetTour: () => void;
}

export function useOnboardingTour(items: VaultItem[]): UseOnboardingTourResult {
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEYS.DISMISSED) === 'true';
    } catch {
      return false;
    }
  });

  const [extExplored, setExtExplored] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEYS.EXT_EXPLORED) === 'true';
    } catch {
      return false;
    }
  });

  const [emergencyKitDone, setEmergencyKitDone] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEYS.EMERGENCY_KIT_DONE) === 'true';
    } catch {
      return false;
    }
  });

  const [auditDone, setAuditDone] = useState<boolean>(() => {
    try {
      return localStorage.getItem(ONBOARDING_STORAGE_KEYS.AUDIT_DONE) === 'true';
    } catch {
      return false;
    }
  });

  // Step 1 is complete if user has at least 1 non-deleted vault item
  const hasItems = useMemo(() => {
    return items.some((item) => !item.deleted);
  }, [items]);

  const steps: OnboardingStepState[] = useMemo(() => [
    { id: 1, isComplete: hasItems },
    { id: 2, isComplete: extExplored },
    { id: 3, isComplete: emergencyKitDone },
    { id: 4, isComplete: auditDone },
  ], [hasItems, extExplored, emergencyKitDone, auditDone]);

  const completedCount = useMemo(() => {
    return steps.filter((s) => s.isComplete).length;
  }, [steps]);

  const isVisible = useMemo(() => {
    if (isDismissed) return false;
    // If all 4 steps are complete, auto-hide
    if (completedCount === 4) return false;
    return true;
  }, [isDismissed, completedCount]);

  const dismissTour = useCallback(() => {
    setIsDismissed(true);
    try {
      localStorage.setItem(ONBOARDING_STORAGE_KEYS.DISMISSED, 'true');
    } catch {
      // ignore
    }
  }, []);

  const markStepComplete = useCallback((stepId: 1 | 2 | 3 | 4) => {
    try {
      if (stepId === 2) {
        setExtExplored(true);
        localStorage.setItem(ONBOARDING_STORAGE_KEYS.EXT_EXPLORED, 'true');
      } else if (stepId === 3) {
        setEmergencyKitDone(true);
        localStorage.setItem(ONBOARDING_STORAGE_KEYS.EMERGENCY_KIT_DONE, 'true');
      } else if (stepId === 4) {
        setAuditDone(true);
        localStorage.setItem(ONBOARDING_STORAGE_KEYS.AUDIT_DONE, 'true');
      }
    } catch {
      // ignore
    }
  }, []);

  const resetTour = useCallback(() => {
    setIsDismissed(false);
    setExtExplored(false);
    setEmergencyKitDone(false);
    setAuditDone(false);
    try {
      localStorage.removeItem(ONBOARDING_STORAGE_KEYS.DISMISSED);
      localStorage.removeItem(ONBOARDING_STORAGE_KEYS.EXT_EXPLORED);
      localStorage.removeItem(ONBOARDING_STORAGE_KEYS.EMERGENCY_KIT_DONE);
      localStorage.removeItem(ONBOARDING_STORAGE_KEYS.AUDIT_DONE);
    } catch {
      // ignore
    }
  }, []);

  return {
    isVisible,
    completedCount,
    totalSteps: 4,
    steps,
    dismissTour,
    markStepComplete,
    resetTour,
  };
}
