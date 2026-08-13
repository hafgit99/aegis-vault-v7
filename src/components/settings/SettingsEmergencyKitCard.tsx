/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Check, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface SettingsEmergencyKitCardProps {
  emergencySecretKey: string;
  onEmergencySecretKeyChange: (val: string) => void;
  emergencyKitSuccess: string | null;
  emergencyKitError: string | null;
  onDownloadEmergencyKit: () => void | Promise<void>;
  t: ReturnType<typeof useLanguage>['t'];
}

export function SettingsEmergencyKitCard({
  emergencySecretKey,
  onEmergencySecretKeyChange,
  emergencyKitSuccess,
  emergencyKitError,
  onDownloadEmergencyKit,
  t,
}: SettingsEmergencyKitCardProps) {
  return (
    <div data-testid="settings-emergency-kit-card" className="glass-panel p-4 sm:p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center border border-outline-variant/10" id="emergency-kit-settings-card">
      <div className="md:col-span-1 space-y-1.5">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Download className="w-4 h-4 text-brand-secondary" />
          <span>{t('settings.emergencyKit.title')}</span>
        </h3>
        <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">
          {t('settings.emergencyKit.description')}
        </p>
      </div>

      <div className="md:col-span-2 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end bg-surface-low p-3 sm:p-4 rounded-xl border border-outline-variant/10">
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
              {t('settings.emergencyKit.secretKeyLabel')}
            </label>
            <input
              data-testid="settings-emergency-secret-key-input"
              type="password"
              value={emergencySecretKey}
              onChange={(e) => onEmergencySecretKeyChange(e.target.value)}
              className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
              placeholder={t('settings.emergencyKit.secretKeyPlaceholder')}
              autoComplete="off"
              spellCheck={false}
            />
            <p className="mt-1.5 text-[11px] text-on-surface-variant leading-relaxed">
              {t('settings.emergencyKit.rememberedHint')}
            </p>
          </div>
          <button
            data-testid="settings-emergency-kit-download-button"
            type="button"
            onClick={onDownloadEmergencyKit}
            className="px-5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 shrink-0 bg-brand-secondary text-black hover:brightness-110 shadow-md shadow-brand-secondary/10"
          >
            <Download className="w-4 h-4" />
            <span>{t('settings.emergencyKit.download')}</span>
          </button>
        </div>

        {emergencyKitSuccess && (
          <div data-testid="settings-emergency-kit-success" className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs leading-relaxed animate-fade-in flex items-start gap-2">
            <Check className="w-4 h-4 shrink-0 text-brand-tertiary mt-0.5" />
            <span>{emergencyKitSuccess}</span>
          </div>
        )}

        {emergencyKitError && (
          <div data-testid="settings-emergency-kit-error" className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs leading-relaxed animate-fade-in flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{emergencyKitError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
