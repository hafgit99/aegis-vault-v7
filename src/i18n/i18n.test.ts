/* @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
  supportedLanguages,
  languageLabels,
  languageFlags,
  isRtlLanguage,
  rtlLanguages,
  translations,
  defaultLanguage,
} from './translations';

describe('i18n Multi-Language System', () => {
  it('supports exactly 12 languages', () => {
    expect(supportedLanguages).toHaveLength(12);
    expect(supportedLanguages).toEqual([
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
    ]);
  });

  it('has label and flag metadata for all 12 languages', () => {
    for (const lang of supportedLanguages) {
      expect(languageLabels[lang]).toBeTruthy();
      expect(typeof languageLabels[lang]).toBe('string');
      expect(languageFlags[lang]).toBeTruthy();
    }
  });

  it('identifies RTL languages correctly', () => {
    expect(isRtlLanguage('ar')).toBe(true);
    expect(rtlLanguages).toContain('ar');
    expect(isRtlLanguage('en')).toBe(false);
    expect(isRtlLanguage('tr')).toBe(false);
    expect(isRtlLanguage('de')).toBe(false);
  });

  it('contains dictionary entries for all 12 languages', () => {
    const referenceKeyCount = Object.keys(translations.en).length;
    expect(referenceKeyCount).toBeGreaterThan(900);

    for (const lang of supportedLanguages) {
      const dict = translations[lang];
      expect(dict).toBeDefined();
      expect(Object.keys(dict).length).toBe(referenceKeyCount);
    }
  });

  it('translates core navigation keys across all languages', () => {
    for (const lang of supportedLanguages) {
      const dict = translations[lang] as Record<string, string>;
      expect(dict['nav.vault']).toBeTruthy();
      expect(dict['nav.settings']).toBeTruthy();
      expect(dict['nav.trash']).toBeTruthy();
      expect(dict['lock.action.unlock']).toBeTruthy();
    }
  });

  it('has default language set to Turkish (tr)', () => {
    expect(defaultLanguage).toBe('tr');
  });
});
