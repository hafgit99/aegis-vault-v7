/**
 * @file LanguageContext.tsx
 * @description React Context Provider for AegisVault v7 multi-language support.
 * Features automatic browser/OS language detection, fallback resolution,
 * and dynamic RTL (Right-to-Left) document layout management.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode} from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import {
  defaultLanguage,
  isRtlLanguage,
  languageStorageKey,
  supportedLanguages,
  translations,
  type LanguageCode,
  type TParams,
  type TranslationKey,
} from './translations';

export type TFunction = (
  key: TranslationKey,
  paramsOrFallback?: TParams | string,
  fallback?: string,
) => string;

interface LanguageContextValue {
  language: LanguageCode;
  setLanguage: (language: LanguageCode) => void;
  t: TFunction;
  isRtl: boolean;
}

const fallbackContext: LanguageContextValue = {
  language: defaultLanguage,
  setLanguage: () => {},
  t: (key, paramsOrFallback, fallback) =>
    translate(
      key,
      translations[defaultLanguage] as Record<string, string>,
      paramsOrFallback,
      fallback,
    ),
  isRtl: false,
};

const LanguageContext = createContext<LanguageContextValue>(fallbackContext);

/**
 * Replaces named `{placeholder}` tokens in a resolved string with params.
 */
function interpolate(template: string, params: TParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Resolves a translation key against a dictionary with `{placeholder}` interpolation.
 *
 * `paramsOrFallback` is overloaded for backward compatibility:
 * - `t(key, { name })` passes interpolation params.
 * - `t(key, 'fallback')` passes a literal fallback string.
 * - `t(key, { name }, 'fallback')` passes both.
 */
export function translate(
  key: string,
  dictionary: Record<string, string>,
  paramsOrFallback?: TParams | string,
  fallback?: string,
): string {
  const params = typeof paramsOrFallback === 'object' ? paramsOrFallback : undefined;
  const literalFallback = typeof paramsOrFallback === 'string' ? paramsOrFallback : fallback;

  const resolved = dictionary[key] ?? literalFallback ?? key;
  if (!params) return resolved;
  return interpolate(resolved, params);
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

  const value = useMemo<LanguageContextValue>(() => {
    const dictionary = translations[language] as Record<string, string>;
    const defaultDictionary = translations[defaultLanguage] as Record<string, string>;
    const enDictionary = translations.en as Record<string, string>;

    return {
      language,
      setLanguage,
      t: (key, paramsOrFallback, fallback) => {
        const params = typeof paramsOrFallback === 'object' ? paramsOrFallback : undefined;
        const literalFallback = typeof paramsOrFallback === 'string' ? paramsOrFallback : fallback;

        if (dictionary[key] !== undefined) {
          return translate(key, dictionary, paramsOrFallback, fallback);
        }
        if (defaultDictionary[key] !== undefined) {
          return translate(key, defaultDictionary, paramsOrFallback, fallback);
        }
        if (enDictionary[key] !== undefined) {
          return translate(key, enDictionary, paramsOrFallback, fallback);
        }
        const missingFallback = literalFallback ?? key;
        return params ? interpolate(missingFallback, params) : missingFallback;
      },
      isRtl,
    };
  }, [language, isRtl]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
