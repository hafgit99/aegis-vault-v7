// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import TrashEmptyState from './TrashEmptyState';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('TrashEmptyState', () => {
  it('renders the empty trash message', () => {
    render(<TrashEmptyState />);

    expect(screen.getByText('Çöp Kutusu Boş')).toBeTruthy();
    expect(screen.getByText(/bekleyen silinmiş herhangi bir parola/i)).toBeTruthy();
  });

  it('renders the empty trash message in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <TrashEmptyState />
      </LanguageProvider>,
    );

    expect(screen.getByText('Trash Is Empty')).toBeTruthy();
    expect(screen.getByText(/no deleted password or card records/i)).toBeTruthy();
  });
});
