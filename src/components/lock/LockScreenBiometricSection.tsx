/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Fingerprint, Key, Sparkles } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface LockScreenBiometricSectionProps {
  isSetup: boolean;
  isBioEnabled: boolean;
  biometricLoading: boolean;
  biometricType: 'platform' | 'cross-platform' | 'native';
  onBiometricUnlock: () => void | Promise<void>;
}

export function LockScreenBiometricSection({
  isSetup,
  isBioEnabled,
  biometricLoading,
  biometricType,
  onBiometricUnlock,
}: LockScreenBiometricSectionProps) {
  const { t } = useLanguage();

  if (!isSetup || !isBioEnabled) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="lock-biometric-button"
      disabled={biometricLoading}
      onClick={onBiometricUnlock}
      className="w-full relative flex items-center justify-center gap-2.5 bg-gradient-to-r from-brand-primary/15 via-emerald-500/10 to-brand-primary/15 border border-brand-primary/40 hover:border-brand-primary hover:shadow-[0_0_20px_rgba(0,255,178,0.25)] text-brand-primary py-3.5 rounded-xl font-bold transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] cursor-pointer animate-fade-in group overflow-hidden"
    >
      {/* Subtle shine highlight */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

      {biometricType === 'cross-platform' ? (
        <Key className={`w-5 h-5 text-brand-primary transition-transform duration-300 group-hover:scale-110 ${biometricLoading ? 'animate-ping' : ''}`} />
      ) : (
        <Fingerprint className={`w-5 h-5 text-brand-primary transition-transform duration-300 group-hover:scale-110 ${biometricLoading ? 'animate-ping' : ''}`} />
      )}
      <span className="tracking-wide">
        {biometricLoading 
          ? t('lock.action.biometricLoading') 
          : biometricType === 'cross-platform'
            ? t('lock.action.biometricFido2')
            : t('lock.action.biometricPlatform')}
      </span>
      <Sparkles className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity text-brand-primary" />
    </button>
  );
}
