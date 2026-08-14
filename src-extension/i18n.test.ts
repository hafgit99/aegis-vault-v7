import { describe, expect, it } from 'vitest';
import {
  extensionTranslations,
  supportedExtensionLanguages,
  translate,
  getPreferredLanguage,
  savePreferredLanguage,
  extensionLanguageLabels,
} from './i18n';

describe('extension i18n support', () => {
  it('supports all 12 languages', () => {
    expect(supportedExtensionLanguages).toHaveLength(12);
    expect(supportedExtensionLanguages).toEqual([
      'tr',
      'en',
      'de',
      'es',
      'fr',
      'it',
      'pt',
      'ru',
      'zh',
      'ja',
      'ko',
      'ar',
    ]);
  });

  it('has identical and complete keys across all 12 languages', () => {
    const enKeys = Object.keys(extensionTranslations.en).sort();
    expect(enKeys.length).toBeGreaterThanOrEqual(30);

    for (const lang of supportedExtensionLanguages) {
      const langKeys = Object.keys(extensionTranslations[lang]).sort();
      expect(langKeys).toEqual(enKeys);

      // Verify no empty translation values
      for (const key of enKeys) {
        const val = (extensionTranslations[lang] as any)[key];
        expect(typeof val).toBe('string');
        expect(val.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('provides correct language labels for all 12 languages', () => {
    for (const lang of supportedExtensionLanguages) {
      expect(extensionLanguageLabels[lang]).toBe(lang.toUpperCase());
    }
  });

  it('translates correctly with explicit language and fallback', () => {
    expect(translate('btn.fill', 'tr')).toBe('Doldur');
    expect(translate('btn.fill', 'en')).toBe('Fill');
    expect(translate('btn.fill', 'de')).toBe('Ausfüllen');
    expect(translate('btn.fill', 'es')).toBe('Rellenar');
    expect(translate('btn.fill', 'fr')).toBe('Remplir');
    expect(translate('btn.fill', 'it')).toBe('Compila');
    expect(translate('btn.fill', 'pt')).toBe('Preencher');
    expect(translate('btn.fill', 'ru')).toBe('Заполнить');
    expect(translate('btn.fill', 'zh')).toBe('自动填充');
    expect(translate('btn.fill', 'ja')).toBe('入力');
    expect(translate('btn.fill', 'ko')).toBe('자동완성');
    expect(translate('btn.fill', 'ar')).toBe('ملء');
  });

  it('persists and retrieves preferred language correctly', () => {
    savePreferredLanguage('ja');
    expect(getPreferredLanguage()).toBe('ja');

    savePreferredLanguage('de');
    expect(getPreferredLanguage()).toBe('de');
  });
});
