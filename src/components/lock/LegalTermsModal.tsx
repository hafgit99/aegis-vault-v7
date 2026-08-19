/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, FileText, Lock, X, CheckCircle2, Shield } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Modal } from '../ui/Modal';

export type LegalTermsTab = 'terms' | 'privacy';

interface LegalTermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: LegalTermsTab;
}

export function LegalTermsModal({
  isOpen,
  onClose,
  initialTab = 'terms',
}: LegalTermsModalProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<LegalTermsTab>(initialTab);

  // Sync initial tab when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} zIndex={200} overlayTestId="legal-terms-modal" closeOnBackdrop={false}>
      <div className="w-full max-w-lg surface-panel rounded-2xl border border-brand-primary/20 p-5 sm:p-6 space-y-4 shadow-2xl flex flex-col max-h-[85vh] animate-scale-up">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant/15 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-brand-primary" />
            </div>
            <div>
              <h2 className="font-display text-base sm:text-lg font-bold text-on-surface leading-tight">
                {t('lock.terms.modal.title')}
              </h2>
              <span className="text-[11px] text-on-surface-variant/70 font-mono">
                Aegis Vault 7 • Zero-Knowledge Security
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

        {/* Scrollable Document Content */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 text-xs text-on-surface-variant/90 leading-relaxed custom-scrollbar">
          {activeTab === 'terms' ? (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-brand-primary/5 border border-brand-primary/10">
                <CheckCircle2 className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                <p className="text-on-surface leading-relaxed font-medium">
                  {t('lock.terms.modal.termsP1')}
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-lowest/80 border border-outline-variant/10">
                <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-on-surface-variant leading-relaxed">
                  {t('lock.terms.modal.termsP2')}
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-lowest/80 border border-outline-variant/10">
                <Shield className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                <p className="text-on-surface-variant leading-relaxed">
                  {t('lock.terms.modal.termsP3')}
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-on-surface leading-relaxed font-medium">
                  {t('lock.terms.modal.privacyP1')}
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-lowest/80 border border-outline-variant/10">
                <Lock className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
                <p className="text-on-surface-variant leading-relaxed">
                  {t('lock.terms.modal.privacyP2')}
                </p>
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-surface-lowest/80 border border-outline-variant/10">
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-on-surface-variant leading-relaxed">
                  {t('lock.terms.modal.privacyP3')}
                </p>
              </div>
            </>
          )}
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
