/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { languageStorageKey } from '../../i18n/translations';
import { SettingsLegalCard } from './SettingsLegalCard';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderCard(onOpenLegal = vi.fn()) {
  render(
    <LanguageProvider>
      <SettingsLegalCard onOpenLegal={onOpenLegal} />
    </LanguageProvider>
  );
  return onOpenLegal;
}

describe('SettingsLegalCard', () => {
  it('offers both documents', () => {
    renderCard();
    expect(screen.getByTestId('settings-legal-card')).toBeTruthy();
    expect(screen.getByTestId('settings-legal-privacy-btn')).toBeTruthy();
    expect(screen.getByTestId('settings-legal-terms-btn')).toBeTruthy();
    expect(screen.getByText('Yasal Bilgilendirme')).toBeTruthy();
  });

  it('asks for the privacy policy when its button is clicked', () => {
    const onOpenLegal = renderCard();
    fireEvent.click(screen.getByTestId('settings-legal-privacy-btn'));
    expect(onOpenLegal).toHaveBeenCalledWith('privacy');
  });

  it('asks for the terms when their button is clicked', () => {
    // Reaching the documents required locking the vault before; the only way to
    // open them was the lock screen. This is the path that removes that.
    const onOpenLegal = renderCard();
    fireEvent.click(screen.getByTestId('settings-legal-terms-btn'));
    expect(onOpenLegal).toHaveBeenCalledWith('terms');
  });

  it('shows the document titles from the synchronised legal copy', () => {
    renderCard();
    expect(screen.getByText('Gizlilik Politikası')).toBeTruthy();
    expect(screen.getByText('Kullanım Şartları')).toBeTruthy();
  });

  it('renders in the active locale', () => {
    window.localStorage.setItem(languageStorageKey, 'en');
    renderCard();
    expect(screen.getByText('Legal')).toBeTruthy();
    expect(screen.getByText('Privacy Policy')).toBeTruthy();
    expect(screen.getByText('Terms of Use')).toBeTruthy();
  });
});