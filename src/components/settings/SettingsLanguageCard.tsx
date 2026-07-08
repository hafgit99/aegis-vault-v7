/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Settings } from 'lucide-react';
import { languageLabels, supportedLanguages, type LanguageCode, type TranslationKey } from '../../i18n/translations';

type TFunction = (key: TranslationKey) => string;

interface SettingsLanguageCardProps {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  t: TFunction;
}

export function SettingsLanguageCard({ language, onLanguageChange, t }: SettingsLanguageCardProps) {
  return (
    <section
      data-testid="language-settings-card"
      className="glass-panel p-4 sm:p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center border border-outline-variant/10"
    >
      <div className="md:col-span-2 space-y-1.5">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Settings className="w-4 h-4 text-brand-primary" />
          <span>{t('settings.language.title')}</span>
        </h3>
        <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">
          {t('settings.language.description')}
        </p>
      </div>

      <label className="space-y-1.5">
        <span className="block text-[10px] font-bold text-on-surface-variant/85 uppercase">
          {t('settings.language.label')}
        </span>
        <select
          data-testid="language-select"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value as LanguageCode)}
          className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
        >
          {supportedLanguages.map((code) => (
            <option key={code} value={code}>
              {languageLabels[code]}
            </option>
          ))}
        </select>
      </label>
    </section>
  );
}
