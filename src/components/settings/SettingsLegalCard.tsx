/**
 * @file SettingsLegalCard.tsx
 * @description Entry point to the privacy policy and terms of use from Settings.
 *
 * Both documents were previously reachable only from the lock screen, before the
 * vault exists. That made them unreadable to anyone already inside the app: a
 * user who wanted to check what they had agreed to had to lock the vault first,
 * and the only reason to do that was to read a document. They are permanent, not
 * a first-run obstacle, so they belong in Settings next to everything else.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { Scale } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { LegalTermsTab } from '../lock/LegalTermsModal';

interface SettingsLegalCardProps {
  onOpenLegal: (tab: LegalTermsTab) => void;
}

export function SettingsLegalCard({ onOpenLegal }: SettingsLegalCardProps) {
  const { t } = useLanguage();

  return (
    <div
      className="glass-panel p-4 sm:p-6 rounded-2xl md:col-span-2 space-y-4"
      id="legal-card"
      data-testid="settings-legal-card"
    >
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
        <Scale className="w-4 h-4 text-brand-primary" />
        <span>{t('settings.legal.title')}</span>
      </h3>

      <p className="text-xs text-on-surface-variant/80 leading-relaxed">
        {t('settings.legal.description')}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        <button
          type="button"
          onClick={() => onOpenLegal('privacy')}
          data-testid="settings-legal-privacy-btn"
          className="flex items-center gap-3 text-left px-4 py-3 rounded-xl bg-surface-lowest/70 border border-outline-variant/20 hover:border-brand-primary/40 hover:bg-surface-low/50 transition-all cursor-pointer group"
        >
          <span className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-brand-primary" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-on-surface">{t('legal.privacy-title')}</span>
            <span className="block text-[11px] text-on-surface-variant/70 truncate">
              {t('settings.legal.updated')}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onOpenLegal('terms')}
          data-testid="settings-legal-terms-btn"
          className="flex items-center gap-3 text-left px-4 py-3 rounded-xl bg-surface-lowest/70 border border-outline-variant/20 hover:border-brand-primary/40 hover:bg-surface-low/50 transition-all cursor-pointer group"
        >
          <span className="w-8 h-8 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4 text-brand-primary" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-bold text-on-surface">{t('legal.terms-title')}</span>
            <span className="block text-[11px] text-on-surface-variant/70 truncate">
              {t('settings.legal.updated')}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

export default SettingsLegalCard;