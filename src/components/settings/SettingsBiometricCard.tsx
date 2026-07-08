/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fingerprint, Key, Check, ShieldAlert } from 'lucide-react';
import { getBiometricType } from '../../lib/biometric';

interface SettingsBiometricCardProps {
  biometricEnabled: boolean;
  biometricLoading: boolean;
  biometricSuccess: string | null;
  biometricError: string | null;
  onToggleBiometric: (type: 'platform' | 'cross-platform') => void;
  t: (key: string) => string;
}

export function SettingsBiometricCard({
  biometricEnabled,
  biometricLoading,
  biometricSuccess,
  biometricError,
  onToggleBiometric,
  t,
}: SettingsBiometricCardProps) {
  const biometricType = getBiometricType();

  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center border border-outline-variant/10" id="biometric-settings-card">
      <div className="md:col-span-1 space-y-1.5 min-w-0">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-start gap-2 min-w-0">
          <Fingerprint className="w-5 h-5 text-brand-primary animate-pulse shrink-0" />
          <span className="min-w-0 leading-snug break-words">{t('settings.biometric.title')}</span>
        </h3>
        <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed break-words">
          {t('settings.biometric.descriptionPrefix')} <b>PBKDF2-SHA256</b> + <b>AES-GCM</b> {t('settings.biometric.descriptionSuffix')}
        </p>
      </div>
      
      <div className="md:col-span-2 space-y-4 min-w-0">
        <div className="space-y-3 bg-surface-low p-3 sm:p-4 rounded-xl border border-outline-variant/10 min-w-0">
          <div className="min-w-0 w-full">
            <span className="text-xs font-bold text-on-surface block uppercase leading-snug whitespace-normal">
              {t('settings.biometric.statusLabel')}:{' '}
              {biometricEnabled
                ? biometricType === 'cross-platform'
                  ? t('settings.biometric.statusActiveFido2')
                  : t('settings.biometric.statusActivePlatform')
                : t('settings.biometric.statusPassive')}
            </span>
            <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed whitespace-normal max-w-[68ch]">
              {biometricEnabled
                ? biometricType === 'cross-platform'
                  ? t('settings.biometric.activeDescriptionFido2')
                  : t('settings.biometric.activeDescriptionPlatform')
                : t('settings.biometric.passiveDescription')}
            </p>
          </div>
          {biometricEnabled ? (
            <button
              type="button"
              disabled={biometricLoading}
              onClick={() => onToggleBiometric('platform')}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 border border-red-500/30 text-brand-error hover:bg-red-500/10"
            >
              {biometricLoading ? <span>{t('settings.biometric.loading')}</span> : <span>{t('settings.biometric.disable')}</span>}
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full min-w-0">
              <button
                type="button"
                disabled={biometricLoading}
                onClick={() => onToggleBiometric('platform')}
                className="w-full min-h-11 px-4 py-2.5 rounded-lg text-xs font-bold leading-snug transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 bg-brand-primary text-brand-on-primary hover:brightness-110 shadow-md shadow-brand-primary/10 whitespace-normal text-center min-w-0"
              >
                <Fingerprint className="w-4 h-4 shrink-0" />
                <span className="min-w-0 break-words">{t('settings.biometric.enablePlatform')}</span>
              </button>
              <button
                type="button"
                disabled={biometricLoading}
                onClick={() => onToggleBiometric('cross-platform')}
                className="w-full min-h-11 px-4 py-2.5 rounded-lg text-xs font-bold leading-snug transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 bg-brand-primary/10 border border-brand-primary/30 text-brand-primary hover:bg-brand-primary/20 whitespace-normal text-center min-w-0"
              >
                <Key className="w-4 h-4 shrink-0" />
                <span className="min-w-0 break-words">{t('settings.biometric.enableFido2')}</span>
              </button>
            </div>
          )}
        </div>

        {biometricSuccess && (
          <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs leading-relaxed animate-fade-in flex items-start gap-2">
            <Check className="w-4 h-4 shrink-0 text-brand-tertiary mt-0.5" />
            <span>{biometricSuccess}</span>
          </div>
        )}

        {biometricError && (
          <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs leading-relaxed animate-fade-in flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-brand-error mt-0.5" />
            <span>{biometricError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
