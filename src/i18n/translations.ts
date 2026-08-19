/**
 * @file translations.ts
 * @description Central modular i18n translations exporter for AegisVault v7.
 * Imports modular locale dictionaries from `./locales/*.ts`.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { tr } from './locales/tr';
import { en } from './locales/en';
import { zh } from './locales/zh';
import { de } from './locales/de';
import { fr } from './locales/fr';
import { es } from './locales/es';
import { it } from './locales/it';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { ja } from './locales/ja';
import { ko } from './locales/ko';
import { ar } from './locales/ar';

export {
  supportedLanguages,
  languageLabels,
  languageFlags,
  defaultLanguage,
  languageStorageKey,
  isRtlLanguage,
  rtlLanguages,
  type LanguageCode,
  type TParams,
} from './i18nTypes';

export const translations = {
  tr,
  en,
  zh,
  de,
  fr,
  es,
  it,
  pt,
  ru,
  ja,
  ko,
  ar,
} as const;

export type TranslationKey = keyof typeof translations.en;
