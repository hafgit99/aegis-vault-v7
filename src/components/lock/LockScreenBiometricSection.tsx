/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Fingerprint, Key } from 'lucide-react';
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
      disabled={biometricLoading}
      onClick={onBiometricUnlock}
      className="w-full flex items-center justify-center gap-2.5 bg-brand-primary/10 border border-brand-primary/30 hover:bg-brand-primary/20 text-brand-primary py-3.5 rounded-xl font-bold transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer animate-fade-in"
    >
      {biometricType === 'cross-platform' ? (
        <Key className={`w-4.5 h-4.5 text-brand-primary ${biometricLoading ? 'animate-ping' : 'animate-pulse'}`} />
      ) : (
        <Fingerprint className={`w-4.5 h-4.5 text-brand-primary ${biometricLoading ? 'animate-ping' : 'animate-pulse'}`} />
      )}
      <span>
        {biometricLoading 
          ? t('lock.action.biometricLoading') 
          : biometricType === 'cross-platform'
            ? t('lock.action.biometricFido2')
            : t('lock.action.biometricPlatform')}
      </span>
    </button>
  );
}
