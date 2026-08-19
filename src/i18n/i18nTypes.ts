/**
 * @file i18nTypes.ts
 * @description Core types, language metadata, flags, and RTL attributes for AegisVault v7.
 * Supports 12 languages out of the box.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

export const supportedLanguages = [
  'tr',
  'en',
  'zh',
  'de',
  'fr',
  'es',
  'it',
  'pt',
  'ru',
  'ja',
  'ko',
  'ar',
] as const;

export type LanguageCode = (typeof supportedLanguages)[number];

export const languageLabels: Record<LanguageCode, string> = {
  tr: 'Türkçe',
  en: 'English',
  zh: '中文 (简体)',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
  ru: 'Русский',
  ja: '日本語',
  ko: '한국어',
  ar: 'العربية',
};

export const languageFlags: Record<LanguageCode, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  zh: '🇨🇳',
  de: '🇩🇪',
  fr: '🇫🇷',
  es: '🇪🇸',
  it: '🇮🇹',
  pt: '🇵🇹',
  ru: '🇷🇺',
  ja: '🇯🇵',
  ko: '🇰🇷',
  ar: '🇸🇦',
};

/** RTL languages list (Right-to-Left text direction) */
export const rtlLanguages: readonly LanguageCode[] = ['ar'] as const;

export function isRtlLanguage(code: LanguageCode): boolean {
  return rtlLanguages.includes(code);
}

export const defaultLanguage: LanguageCode = 'tr';
export const languageStorageKey = 'aegis-vault-language';

/** Named interpolation parameters passed to the `t()` translation function. */
export type TParams = Record<string, string | number>;
