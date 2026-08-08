/**
 * @file LanguageContext.tsx
 * @description React Context Provider for AegisVault v7 multi-language support.
 * Features automatic browser/OS language detection, fallback resolution,
 * and dynamic RTL (Right-to-Left) document layout management.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import {
  defaultLanguage,
  isRtlLanguage,
  languageStorageKey,
  supportedLanguages,
  translations,
  type LanguageCode,
  type TranslationKey,
} from './translations';

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: (key: TranslationKey) => string;
  isRtl: boolean;
}

const fallbackContext: LanguageContextValue = {
  language: defaultLanguage,
  setLanguage: () => {},
  t: (key) => (translations[defaultLanguage] as Record<string, string>)[key] ?? key,
  isRtl: false,
};

const LanguageContext = createContext<LanguageContextValue>(fallbackContext);

function detectBrowserLanguage(): LanguageCode {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return defaultLanguage;

  const rawLangs = navigator.languages || [navigator.language];
  for (const lang of rawLangs) {
    if (!lang) continue;
    const primary = lang.toLowerCase().split('-')[0] as LanguageCode;
    if (supportedLanguages.includes(primary)) {
      return primary;
    }
  }
  return defaultLanguage;
}

function readStoredLanguage(): LanguageCode {
  if (typeof window === 'undefined') return defaultLanguage;
  const storedLanguage = window.localStorage.getItem(languageStorageKey);
  if (storedLanguage && supportedLanguages.includes(storedLanguage as LanguageCode)) {
    return storedLanguage as LanguageCode;
  }
  return defaultLanguage;
}

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage);

  const setLanguage = (nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
  };

  const isRtl = isRtlLanguage(language);

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
    
    // Manage document language tag
    const langAttr = language === 'zh' ? 'zh-CN' : language === 'ar' ? 'ar-SA' : language;
    document.documentElement.lang = langAttr;
    
    // Manage RTL layout attribute
    if (isRtl) {
      document.documentElement.setAttribute('dir', 'rtl');
      document.documentElement.classList.add('rtl');
    } else {
      document.documentElement.setAttribute('dir', 'ltr');
      document.documentElement.classList.remove('rtl');
    }
  }, [language, isRtl]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) =>
        (translations[language] as Record<string, string>)[key] ??
        (translations[defaultLanguage] as Record<string, string>)[key] ??
        (translations.en as Record<string, string>)[key] ??
        key,
      isRtl,
    }),
    [language, isRtl],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
