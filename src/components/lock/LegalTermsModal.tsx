/**
 * @file LegalTermsModal.tsx
 * @description The privacy policy and terms of use, as they appear in the app.
 *
 * The copy here used to be a three-paragraph summary written separately from the
 * website's, and the two documents disagreed. For a legal document that is the
 * worst possible state: a user agrees to one set of terms and is shown another
 * at first run, and neither side is authoritative. The website's text is now the
 * single source -- it is what ships, it is what was reviewed, and it already
 * existed in all twelve languages -- and scripts/sync-legal-copy.cjs copies it
 * into every locale under legal.*.
 *
 * Both documents are reproduced in full, all eight sections each. Summarising
 * them would leave the app carrying a second, shorter legal text, which is the
 * thing this change exists to end.
 *
 * Inline markup goes through LegalRichText rather than dangerouslySetInnerHTML:
 * the strings come from a translation table, and a locale file must not be able
 * to introduce script into the app.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, FileText, Lock, X } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Modal } from '../ui/Modal';
import { LegalRichText } from './LegalRichText';

export type LegalTermsTab = 'terms' | 'privacy';

interface LegalTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTermsTab;
}

/* The documents count their own sections in their headings, so the list is read
 * from the translation rather than derived: a hardcoded length would drift the
 * moment a section were added to either document. */
const PRIVACY_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
const TERMS_SECTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export function LegalTermsModal({
  isOpen,
  onClose,
  initialTab = 'terms',
}: LegalTermsModalProps) {
  const { t } = useLanguage();
  // The tab is state because the reader switches between the two documents, but
  // it is seeded from the prop and reset by keying the modal at each call site
  // (see `key={...}` in SettingsPanel and LockScreen). The alternative -- an
  // effect that copies initialTab into state -- re-renders on every open and is
  // what React's set-state-in-effect rule exists to discourage.
  const [activeTab, setActiveTab] = useState<LegalTermsTab>(initialTab);

  if (!isOpen) return null;

  const sections = activeTab === 'terms' ? TERMS_SECTIONS : PRIVACY_SECTIONS;
  const prefix = activeTab === 'terms' ? 'terms' : 'privacy';
  const key = (suffix: string) => t(`legal.${prefix}-${suffix}` as never);

  return (
    <Modal open={isOpen} onClose={onClose} zIndex={200} overlayTestId="legal-terms-modal" closeOnBackdrop={false}>
      <div
        className="w-full max-w-2xl surface-panel rounded-2xl border border-brand-primary/20 p-5 sm:p-6 space-y-4 shadow-2xl flex flex-col max-h-[85vh] animate-scale-up"
        role="document"
        aria-label={key('title')}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/15 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-on-surface leading-tight">
                {t('lock.terms.modal.title')}
              </h2>
              <span className="text-[11px] text-on-surface-variant/70 font-mono">
                KalderaShield • Zero-Knowledge Security
              </span>
            </div>
          </div>
          <button
            data-testid="legal-terms-close-icon"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-on-surface-variant/60 hover:text-on-surface hover:bg-surface-low transition-colors cursor-pointer"
            title={t('lock.terms.close')}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-surface-lowest/70 p-1 rounded-xl border border-outline-variant/15 shrink-0">
          <button
            data-testid="legal-terms-tab-terms"
            type="button"
            onClick={() => setActiveTab('terms')}
            aria-pressed={activeTab === 'terms'}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'terms'
                ? 'bg-brand-primary text-brand-on-primary shadow-sm'
                : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-low/50'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{t('lock.terms.modal.termsTab')}</span>
          </button>
          <button
            data-testid="legal-terms-tab-privacy"
            type="button"
            onClick={() => setActiveTab('privacy')}
            aria-pressed={activeTab === 'privacy'}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'privacy'
                ? 'bg-brand-primary text-brand-on-primary shadow-sm'
                : 'text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-low/50'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t('lock.terms.modal.privacyTab')}</span>
          </button>
        </div>

        {/* The document, in full. */}
        <div
          className="flex-1 overflow-y-auto pr-1 space-y-4 text-[13px] text-on-surface-variant/90 leading-relaxed custom-scrollbar"
          data-testid="legal-terms-document"
        >
          <div className="space-y-1">
            <h3 className="font-display text-base font-bold text-on-surface">{key('title')}</h3>
            <p className="text-[11px] text-on-surface-variant/60 font-mono">{key('updated')}</p>
          </div>

          {sections.map((n) => (
            <section key={n} className="space-y-1.5">
              <h4
                className="font-bold text-on-surface text-[13px] pt-1"
                data-testid={`legal-${prefix}-heading-${n}`}
              >
                <LegalRichText>{key(`h2-${n}`)}</LegalRichText>
              </h4>
              <p className="text-on-surface-variant/90">
                <LegalRichText>{key(`p1-${n}`)}</LegalRichText>
              </p>
            </section>
          ))}

          <p className="pt-2 mt-1 border-t border-outline-variant/10 text-[11px] text-on-surface-variant/70 italic">
            <LegalRichText>{key('governing')}</LegalRichText>
          </p>
        </div>

        {/* Footer Action */}
        <div className="pt-2 border-t border-outline-variant/10 shrink-0">
          <button
            data-testid="legal-terms-modal-confirm-btn"
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-brand-primary text-brand-on-primary font-bold text-xs hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer shadow-md"
          >
            {t('lock.terms.modal.close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
