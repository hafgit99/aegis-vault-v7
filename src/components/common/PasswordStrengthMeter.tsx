/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { calculatePasswordScore, getStrengthLabel } from '../../lib/security';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';

const strengthLabelKeys: Record<ReturnType<typeof getStrengthLabel>['label'], TranslationKey> = {
  WEAK: 'vaultItem.strength.weak',
  MEDIUM: 'vaultItem.strength.medium',
  STRONG: 'vaultItem.strength.strong',
  SECURE: 'vaultItem.strength.secure',
};

interface PasswordStrengthMeterProps {
  password?: string;
  showDetails?: boolean;
}

export function PasswordStrengthMeter({
  password = '',
  showDetails = true,
}: PasswordStrengthMeterProps) {
  const { t } = useLanguage();

  const score = useMemo(() => calculatePasswordScore(password), [password]);
  const strength = useMemo(() => getStrengthLabel(password), [password]);

  // Predefined Tailwind width classes for CSP compliance (no inline styles)
  const widthClass = useMemo(() => {
    if (score <= 10) return 'w-[10%]';
    if (score <= 20) return 'w-[20%]';
    if (score <= 30) return 'w-[30%]';
    if (score <= 40) return 'w-[40%]';
    if (score <= 50) return 'w-[50%]';
    if (score <= 60) return 'w-[60%]';
    if (score <= 70) return 'w-[70%]';
    if (score <= 80) return 'w-[80%]';
    if (score <= 90) return 'w-[90%]';
    return 'w-full';
  }, [score]);

  const theme = useMemo(() => {
    switch (strength.label) {
      case 'WEAK':
        return {
          bar: 'bg-red-500 from-red-600 to-red-400 shadow-[0_0_8px_rgba(239,68,68,0.35)]',
          text: 'text-red-400',
          badge: 'bg-red-500/15 text-red-300 border-red-500/30',
        };
      case 'MEDIUM':
        return {
          bar: 'bg-amber-400 from-amber-500 to-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.35)]',
          text: 'text-amber-400',
          badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        };
      case 'STRONG':
        return {
          bar: 'bg-blue-400 from-blue-500 to-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.35)]',
          text: 'text-blue-400',
          badge: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
        };
      case 'SECURE':
        return {
          bar: 'bg-emerald-400 from-emerald-500 to-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.35)]',
          text: 'text-emerald-400',
          badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        };
    }
  }, [strength.label]);

  if (!password) {
    return null;
  }

  return (
    <div data-testid="password-strength-meter" className="space-y-1.5 mt-2 select-none animate-fade-in">
      {/* Progress Track */}
      <div className="w-full h-1.5 bg-surface-low rounded-full overflow-hidden border border-outline-variant/10">
        <div
          data-testid="password-strength-bar"
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-300 ease-out ${theme.bar} ${widthClass}`}
        />
      </div>

      {/* Label and Score Info */}
      {showDetails && (
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span
            data-testid="password-strength-label"
            className={`px-2 py-0.5 rounded-md font-bold border text-[10px] uppercase tracking-wider ${theme.badge}`}
          >
            {t(strengthLabelKeys[strength.label])}
          </span>
          <span data-testid="password-strength-score" className={`font-bold ${theme.text}`}>
            %{score}
          </span>
        </div>
      )}
    </div>
  );
}
