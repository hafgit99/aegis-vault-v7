/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Smartphone, Check, ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface SettingsAutofillCardProps {
  autofillEnabled: boolean;
  autofillMessage: string | null;
  autofillError: string | null;
  onOpenAutofillSettings: () => void;
}

export function SettingsAutofillCard({
  autofillEnabled,
  autofillMessage,
  autofillError,
  onOpenAutofillSettings,
}: SettingsAutofillCardProps) {
  const { t } = useLanguage();
  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center border border-outline-variant/10" id="android-autofill-settings-card">
      <div className="md:col-span-1 space-y-1.5">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[#2096f3]" />
          <span>{t('settings.autofill.title')}</span>
        </h3>
        <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">
          {t('settings.autofill.description')}
        </p>
      </div>

      <div className="md:col-span-2 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 justify-between bg-surface-low p-3 sm:p-4 rounded-xl border border-outline-variant/10">
          <div>
            <span className="text-xs font-bold text-on-surface block uppercase">
              {t('settings.autofill.statusLabel')}: {autofillEnabled ? t('settings.autofill.statusActive') : t('settings.autofill.statusSetup')}
            </span>
            <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
              {t('settings.autofill.safetyNote')}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenAutofillSettings}
            className="px-5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shrink-0 bg-[#2096f3] text-white hover:brightness-110 shadow-md shadow-[#2096f3]/10"
          >
            <Smartphone className="w-4 h-4" />
            <span>{t('settings.autofill.openSettings')}</span>
          </button>
        </div>

        {autofillMessage && (
          <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs leading-relaxed animate-fade-in flex items-start gap-2">
            <Check className="w-4 h-4 shrink-0 text-brand-tertiary mt-0.5" />
            <span>{autofillMessage}</span>
          </div>
        )}

        {autofillError && (
          <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs leading-relaxed animate-fade-in flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
            <span>{autofillError}</span>
          </div>
        )}
      </div>
    </div>
  );
}
