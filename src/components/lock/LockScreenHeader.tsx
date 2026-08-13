/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { supportedLanguages, languageLabels, languageFlags, type LanguageCode } from '../../i18n/translations';

export function LockScreenHeader() {
  const { language, setLanguage } = useLanguage();

  return (
    <header className="absolute top-[max(env(safe-area-inset-top),0.5rem)] right-[max(env(safe-area-inset-right),1rem)] sm:right-[max(env(safe-area-inset-right),1.5rem)] z-50">
      <div className="flex items-center gap-2 bg-surface-low/60 backdrop-blur-md rounded-lg px-3 py-1.5 border border-outline-variant/10">
        <Languages className="w-4 h-4 text-brand-primary" />
        <select
          data-testid="lock-language-select"
          value={language}
          onChange={(e) => setLanguage(e.target.value as LanguageCode)}
          className="bg-transparent text-xs font-bold text-on-surface focus:outline-none cursor-pointer pr-1"
        >
          {supportedLanguages.map((code) => (
            <option key={code} value={code} className="bg-surface-lowest text-on-surface">
              {languageFlags[code]}  {languageLabels[code]}
            </option>
          ))}
        </select>
      </div>
    </header>
  );
}
