// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import LocalStorageBadge from './LocalStorageBadge';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('LocalStorageBadge', () => {
  it('renders the local storage status label', () => {
    render(<LocalStorageBadge />);

    expect(screen.getByText('SADECE YEREL DEPOLAMA')).toBeTruthy();
  });

  it('renders the local storage status label in the selected language', () => {
    window.localStorage.setItem(languageStorageKey, 'en');

    render(
      <LanguageProvider>
        <LocalStorageBadge />
      </LanguageProvider>,
    );

    expect(screen.getByText('LOCAL STORAGE ONLY')).toBeTruthy();
  });
});
