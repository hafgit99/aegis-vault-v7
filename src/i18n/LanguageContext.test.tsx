/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LanguageProvider, useLanguage } from './LanguageContext';
import type { TranslationKey } from './translations';
import { languageStorageKey } from './translations';

function LanguageProbe() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div>
      <span data-testid="current-language">{language}</span>
      <span data-testid="vault-label">{t('nav.vault')}</span>
      <button type="button" onClick={() => setLanguage('en')}>
        English
      </button>
      <button type="button" onClick={() => setLanguage('zh')}>
        Chinese
      </button>
    </div>
  );
}

function TranslationProbe() {
  const { t } = useLanguage();

  return (
    <div>
      <span data-testid="interpolated">{t('tags.managerUsage', { count: 3 })}</span>
      <span data-testid="named-param">{t('tags.deleteAria', { name: 'work' })}</span>
      <span data-testid="missing-fallback">{t('missing.key.here' as TranslationKey, 'Varsayılan metin')}</span>
      <span data-testid="missing-param-fallback">
        {t('missing.key.with.param' as TranslationKey, { count: 5 }, 'Yedek {count}')}
      </span>
      <span data-testid="missing-no-fallback">{t('missing.key.no.fallback' as TranslationKey)}</span>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = '';
});

afterEach(() => {
  cleanup();
});

describe('LanguageProvider', () => {
  it('uses Turkish by default and persists language changes', () => {
    render(
      <LanguageProvider>
        <LanguageProbe />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('current-language').textContent).toBe('tr');
    expect(screen.getByTestId('vault-label').textContent).toBe('Kasa (Vault)');

    fireEvent.click(screen.getByText('English'));

    expect(screen.getByTestId('current-language').textContent).toBe('en');
    expect(screen.getByTestId('vault-label').textContent).toBe('Vault');
    expect(window.localStorage.getItem(languageStorageKey)).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    fireEvent.click(screen.getByText('Chinese'));

    expect(screen.getByTestId('current-language').textContent).toBe('zh');
    expect(screen.getByTestId('vault-label').textContent).toBe('保险库');
    expect(window.localStorage.getItem(languageStorageKey)).toBe('zh');
    expect(document.documentElement.lang).toBe('zh-CN');
  });

  it('interpolates named params and honors fallback strings', () => {
    render(
      <LanguageProvider>
        <TranslationProbe />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('interpolated').textContent).toBe('3 ögede kullanılıyor');
    expect(screen.getByTestId('named-param').textContent).toBe('"work" etiketini sil');
    expect(screen.getByTestId('missing-fallback').textContent).toBe('Varsayılan metin');
    expect(screen.getByTestId('missing-param-fallback').textContent).toBe('Yedek 5');
    expect(screen.getByTestId('missing-no-fallback').textContent).toBe('missing.key.no.fallback');
  });

  it('interpolates params with en locale', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <EnglishProbe />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('en-interpolated').textContent).toBe('Used in 7 items');
  });
});

function EnglishProbe() {
  const { t } = useLanguage();

  return <span data-testid="en-interpolated">{t('tags.managerUsage', { count: 7 })}</span>;
}
