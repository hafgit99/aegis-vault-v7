/**
 * @file legal-copy.test.ts
 * @description Guards the app's legal documents against drifting from the website.
 *
 * The privacy policy and terms are generated into every locale by
 * scripts/sync-legal-copy.cjs. Nothing at runtime enforces that: a locale added
 * later, or a script that half-ran, would render the privacy policy with
 * missing sections and no error anywhere. These assertions turn that silent
 * failure into a red build.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { supportedLanguages, translations } from './translations';

describe('legal copy', () => {
  /* Headings and body for both documents, plus the chrome around them. */
  const KEYS = [
    'legal.privacy-title',
    'legal.privacy-updated',
    'legal.privacy-governing',
    'legal.terms-title',
    'legal.terms-updated',
    'legal.terms-governing',
    'settings.legal.title',
    'settings.legal.description',
    'settings.legal.updated',
  ];

  for (let n = 1; n <= 8; n++) {
    KEYS.push(`legal.privacy-h2-${n}`, `legal.privacy-p1-${n}`);
    KEYS.push(`legal.terms-h2-${n}`, `legal.terms-p1-${n}`);
  }

  const missing: string[] = [];

  for (const locale of supportedLanguages) {
    const dict = translations[locale] as Record<string, string>;
    for (const key of KEYS) {
      // An empty string is as bad as an absent key here: the section would
      // render as a blank heading.
      if (!dict?.[key]) missing.push(`${locale}:${key}`);
    }
  }

  it('has every legal key in all twelve locales', () => {
    expect(missing).toEqual([]);
  });

  it('renders each document as eight numbered sections', () => {
    // Arabic numbers its sections with Arabic-Indic digits, so the check is
    // "starts with a digit and a separator", not a Latin literal. What matters
    // is that a section is numbered at all: an unnumbered heading would read as
    // a continuation of the previous one.
    const startsWithNumber = (value: string) => /^\p{N}[.．。]/u.test(value);

    for (const locale of supportedLanguages) {
      const dict = translations[locale] as Record<string, string>;
      for (let n = 1; n <= 8; n++) {
        expect(startsWithNumber(dict[`legal.privacy-h2-${n}`])).toBe(true);
        expect(startsWithNumber(dict[`legal.terms-h2-${n}`])).toBe(true);
      }
    }
  });

  it('carries the emphasised claims that the summaries dropped', () => {
    // Section 2 of the privacy policy is the promise that vault data is never
    // collected; section 4 of the terms is the warning that no recovery exists.
    // Both were marked <strong> on the website and must survive the sync.
    for (const locale of supportedLanguages) {
      const dict = translations[locale] as Record<string, string>;
      expect(dict['legal.privacy-p1-2']).toContain('<strong>');
      expect(dict['legal.terms-p1-4']).toContain('<strong>');
    }
  });

  it('names the data-protection rights the website states', () => {
    // KVKK m.11 and GDPR appear in the website's rights section. The old
    // three-paragraph version named neither.
    expect(translations.tr['legal.privacy-p1-6']).toContain('KVKK');
    expect(translations.tr['legal.privacy-p1-6']).toContain('GDPR');
  });
});
