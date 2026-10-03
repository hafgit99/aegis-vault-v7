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

  it('renders every published section of the terms, not a summary', async () => {
    const onClose = vi.fn();
    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={onClose} initialTab="terms" />
      </LanguageProvider>
    );

    expect(screen.getByTestId('legal-terms-modal')).toBeTruthy();

    // The regression this replaced: the modal showed three paragraphs while the
    // website published eight numbered sections, so the document a user agreed
    // to was not the document the site served.
    for (let n = 1; n <= 8; n++) {
      expect(screen.getByTestId(`legal-terms-heading-${n}`)).toBeTruthy();
    }
    expect(screen.getByText(/1\. Kabul ve kapsam/)).toBeTruthy();
    expect(screen.getByText(/Ana parola ve veri kaybı/)).toBeTruthy();

    fireEvent.click(screen.getByTestId('legal-terms-modal-confirm-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders every published section of the privacy policy', async () => {
    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={vi.fn()} initialTab="privacy" />
      </LanguageProvider>
    );

    for (let n = 1; n <= 8; n++) {
      expect(screen.getByTestId(`legal-privacy-heading-${n}`)).toBeTruthy();
    }
    expect(screen.getByText(/Kasa veriniz: asla toplanmaz/)).toBeTruthy();
    // KVKK m.11 and GDPR are named in the website's rights section; they were
    // absent from the three-paragraph version entirely.
    expect(screen.getByText(/KVKK/)).toBeTruthy();
  });

  it('keeps the emphasised legal claims as markup, not raw tags', async () => {
    // The <strong> in section 2 of the privacy policy is the sentence promising
    // vault data is never collected. Rendered as text it would be a wall of
    // angles, and the claim would stop standing out.
    const { container } = render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={vi.fn()} initialTab="privacy" />
      </LanguageProvider>
    );

    const strongs = container.querySelectorAll('strong');
    expect(strongs.length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('<strong>');
    expect(container.textContent).toContain('hiçbir koşulda toplamaz');
  });

  it('opens on the requested tab', async () => {
    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={vi.fn()} initialTab="privacy" />
      </LanguageProvider>
    );
    expect(screen.getByTestId('legal-privacy-heading-1')).toBeTruthy();
    expect(screen.queryByTestId('legal-terms-heading-1')).toBeNull();
  });

  it('renders the English documents when the locale is en', () => {
    window.localStorage.setItem(languageStorageKey, 'en');
    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={vi.fn()} initialTab="terms" />
      </LanguageProvider>
    );

    expect(screen.getByTestId('legal-terms-heading-1')).toBeTruthy();
    expect(screen.getByText(/Acceptance and scope/i)).toBeTruthy();
    expect(screen.getByText('Understood & Close')).toBeTruthy();
  });

  it('renders the Arabic documents in the active locale', () => {
    window.localStorage.setItem(languageStorageKey, 'ar');
    render(
      <LanguageProvider>
        <LegalTermsModal isOpen={true} onClose={vi.fn()} initialTab="terms" />
      </LanguageProvider>
    );

    expect(screen.getByTestId('legal-terms-heading-1')).toBeTruthy();
    expect(screen.getByText(/القبول والنطاق/)).toBeTruthy();
    expect(screen.getByText('فهمت وإغلاق')).toBeTruthy();
  });
});
