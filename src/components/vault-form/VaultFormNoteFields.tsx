/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StickyNote } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { VaultFormCategory } from './VaultFormCategoryTabs';

interface VaultFormNoteFieldsProps {
  category: VaultFormCategory;
  notes: string;
  onNotesChange: (val: string) => void;
}

export function VaultFormNoteFields({
  category,
  notes,
  onNotesChange,
}: VaultFormNoteFieldsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 animate-fade-in text-left">
      {category === 'secure_note' && (
        <>
          <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
            <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.secureNote.title')}</h4>
            <p className="text-[10px] text-on-surface-variant">{t('vaultForm.secureNote.description')}</p>
          </div>
          <p className="text-[11px] text-amber-400">{t('vaultForm.secureNote.warning')}</p>
        </>
      )}

      <div>
        <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
          {category === 'secure_note' ? t('vaultForm.notes.secureLabel') : t('vaultForm.notes.extraLabel')}
        </label>
        <div className="relative">
          <StickyNote className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
          <textarea
            data-testid="vault-item-notes-input"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={category === 'secure_note' ? 8 : 3}
            className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface resize-none font-sans leading-relaxed"
            placeholder={category === 'secure_note' ? t('vaultForm.notes.securePlaceholder') : t('vaultForm.notes.extraPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}
