// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import TrashInfoBanner from './TrashInfoBanner';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('TrashInfoBanner', () => {
  it('renders the trash data protection notice', () => {
    render(<TrashInfoBanner />);

    expect(screen.getByText('Güvenlik ve Veri Koruma Bilgilendirmesi')).toBeTruthy();
    expect(screen.getByText(/local-first mimariyi esas alır/i)).toBeTruthy();
  });

  it('renders the trash data protection notice in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <TrashInfoBanner />
      </LanguageProvider>,
    );

    expect(screen.getByText('Security and Data Protection Notice')).toBeTruthy();
    expect(screen.getByText(/local-first architecture/i)).toBeTruthy();
  });
});
