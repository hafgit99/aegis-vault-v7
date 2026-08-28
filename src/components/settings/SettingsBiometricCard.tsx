/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Fingerprint, Key, Check, ShieldAlert, AlertTriangle, ShieldCheck } from 'lucide-react';
import { getBiometricType, isBiometricAutofillRequireEnabled, isBiometricHardwareBound, isBiometricV2UpgradeRequired, setBiometricAutofillRequireEnabled } from '../../lib/biometric';
import type { TFunction } from '../../i18n/LanguageContext';

interface SettingsBiometricCardProps {
  biometricEnabled: boolean;
  biometricLoading: boolean;
  biometricSuccess: string | null;
  biometricError: string | null;
  onToggleBiometric: (type: 'platform' | 'cross-platform') => void;
  t: TFunction;
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
  const [autofillRequire, setAutofillRequire] = useState(isBiometricAutofillRequireEnabled());
  const v2UpgradeRequired = isBiometricV2UpgradeRequired();
  // RUST-O6: surface whether the active binding is hardware-bound
  // (WebAuthn PRF authenticator, or the auth-bound AndroidKeyStore bridge).
  const hardwareBound = biometricEnabled && isBiometricHardwareBound();

  const handleToggleAutofillRequire = () => {
    const next = !autofillRequire;
    setBiometricAutofillRequireEnabled(next);
    setAutofillRequire(next);
  };

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
        {v2UpgradeRequired && !biometricEnabled && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs leading-relaxed animate-fade-in flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
            <span className="break-words">{t('settings.biometric.v2UpgradeNotice')}</span>
          </div>
        )}

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

            {biometricEnabled && (
              <div className="mt-2.5 pt-2.5 border-t border-outline-variant/10 min-w-0">
                <span className="text-[11px] font-bold text-on-surface block leading-snug whitespace-normal break-words">
                  {t('settings.biometric.securityLevelLabel')}:{' '}
                  {hardwareBound
                    ? t('settings.biometric.securityLevelHardware')
                    : t('settings.biometric.securityLevelSoftware')}
                </span>
                <p
                  className={`text-[11px] mt-1 leading-relaxed whitespace-normal break-words flex items-start gap-1.5 ${
                    hardwareBound ? 'text-brand-tertiary' : 'text-amber-300'
                  }`}
                >
                  {hardwareBound ? (
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span className="min-w-0">
                    {hardwareBound
                      ? t('settings.biometric.securityNoticeHardwareBound')
                      : t('settings.biometric.securityNoticeConvenience')}
                  </span>
                </p>
              </div>
            )}
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

        {biometricEnabled && (
          <div className="flex items-center justify-between p-3 bg-surface-low rounded-xl border border-outline-variant/10">
            <div className="space-y-0.5">
              <span className="text-xs font-bold text-on-surface block">
                {t('settings.biometric.autofillConfirmTitle')}
              </span>
              <span className="text-[11px] text-on-surface-variant block">
                {t('settings.biometric.autofillConfirmDesc')}
              </span>
            </div>
            <input
              type="checkbox"
              checked={autofillRequire}
              onChange={handleToggleAutofillRequire}
              aria-label={t('settings.biometric.autofillConfirmTitle')}
              className="w-4 h-4 accent-brand-primary cursor-pointer"
            />
          </div>
        )}

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
