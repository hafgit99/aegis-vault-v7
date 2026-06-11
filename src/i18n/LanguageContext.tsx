import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

import {
  defaultLanguage,
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
}

const fallbackContext: LanguageContextValue = {
  language: defaultLanguage,
  setLanguage: () => {},
  t: (key) => translations[defaultLanguage][key],
};

const LanguageContext = createContext<LanguageContextValue>(fallbackContext);

function readStoredLanguage(): LanguageCode {
  if (typeof window === 'undefined') return defaultLanguage;
  const storedLanguage = window.localStorage.getItem(languageStorageKey);
  return supportedLanguages.includes(storedLanguage as LanguageCode)
    ? (storedLanguage as LanguageCode)
    : defaultLanguage;
}

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({ children }: LanguageProviderProps) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage);

  const setLanguage = (nextLanguage: LanguageCode) => {
    setLanguageState(nextLanguage);
  };

  useEffect(() => {
    window.localStorage.setItem(languageStorageKey, language);
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key) => translations[language][key] ?? translations[defaultLanguage][key],
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}
