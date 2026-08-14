/**
 * @vitest-environment jsdom
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../i18n/LanguageContext';
import { languageStorageKey } from '../../i18n/translations';
import { LegalTermsModal } from './LegalTermsModal';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('LegalTermsModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={false} onClose={vi.fn()} />
      </LanguageProvider>
    );

    expect(screen.queryByTestId('legal-terms-modal')).toBeNull();
  });

  it('renders modal in Turkish by default and allows tab switching', () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={onClose} initialTab="terms" />
      </LanguageProvider>
    );

    expect(screen.getByTestId('legal-terms-modal')).toBeTruthy();
    expect(screen.getByText('Yasal Bilgilendirme ve Güvenlik Koşulları')).toBeTruthy();
    expect(screen.getByText(/Aegis Vault 7, yerel-öncelikli/i)).toBeTruthy();

    // Switch to privacy tab
    fireEvent.click(screen.getByTestId('legal-terms-tab-privacy'));
    expect(screen.getByText(/hiçbir kişisel veri/i)).toBeTruthy();

    // Click confirm/close button
    fireEvent.click(screen.getByTestId('legal-terms-modal-confirm-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders modal with English translations when locale is en', () => {
    window.localStorage.setItem(languageStorageKey, 'en');
    const onClose = vi.fn();

    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={onClose} initialTab="privacy" />
      </LanguageProvider>
    );

    expect(screen.getByText('Legal Information & Security Terms')).toBeTruthy();
    expect(screen.getByText(/does not collect, log, track, or share any personal data/i)).toBeTruthy();
    expect(screen.getByText('Understood & Close')).toBeTruthy();

    // Switch to Terms tab
    fireEvent.click(screen.getByTestId('legal-terms-tab-terms'));
    expect(screen.getByText(/offline-first, zero-knowledge secure password/i)).toBeTruthy();

    // Click top-right close icon
    fireEvent.click(screen.getByTestId('legal-terms-close-icon'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders modal in Arabic (RTL support and localized copy)', () => {
    window.localStorage.setItem(languageStorageKey, 'ar');
    const onClose = vi.fn();

    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={onClose} initialTab="terms" />
      </LanguageProvider>
    );

    expect(screen.getByText('المعلومات القانونية وشروط الأمان')).toBeTruthy();
    expect(screen.getByText(/Aegis Vault 7 هو مخزن كلمات مرور/i)).toBeTruthy();
    expect(screen.getByText('فهمت وإغلاق')).toBeTruthy();
  });
});
