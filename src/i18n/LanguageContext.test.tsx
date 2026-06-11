/**
 * @vitest-environment jsdom
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LanguageProvider, useLanguage } from './LanguageContext';
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
});
