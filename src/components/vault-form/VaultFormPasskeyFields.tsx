/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Fingerprint, User, Wand2, KeyRound } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface VaultFormPasskeyFieldsProps {
  passkeyService: string;
  onPasskeyServiceChange: (val: string) => void;
  passkeyPublicId: string;
  onPasskeyPublicIdChange: (val: string) => void;
  passkeyPrivateExponent: string;
  onPasskeyPrivateExponentChange: (val: string) => void;
  onAutoGeneratePrivateExponent: () => void;
}

export function VaultFormPasskeyFields({
  passkeyService,
  onPasskeyServiceChange,
  passkeyPublicId,
  onPasskeyPublicIdChange,
  passkeyPrivateExponent,
  onPasskeyPrivateExponentChange,
  onAutoGeneratePrivateExponent,
}: VaultFormPasskeyFieldsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 animate-fade-in text-left">
      <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
        <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.passkey.title')}</h4>
        <p className="text-[10px] text-on-surface-variant">{t('vaultForm.passkey.description')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.passkey.service')}
          </label>
          <div className="relative">
            <Fingerprint className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-passkey-service-input"
              type="text"
              value={passkeyService}
              onChange={(e) => onPasskeyServiceChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
              placeholder={t('vaultForm.passkey.servicePlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.passkey.publicId')}
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-passkey-id-input"
              type="text"
              value={passkeyPublicId}
              onChange={(e) => onPasskeyPublicIdChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.passkey.publicIdPlaceholder')}
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5 flex justify-between items-center">
          <span>{t('vaultForm.passkey.privateExponent')}</span>
          <button
            type="button"
            onClick={onAutoGeneratePrivateExponent}
            className="text-[9px] text-brand-primary hover:underline flex items-center gap-0.5"
            title={t('vaultForm.passkey.generateTitle')}
          >
            <Wand2 className="w-3 h-3" />
            <span>{t('vaultForm.passkey.generate')}</span>
          </button>
        </label>
        <div className="relative">
          <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
          <textarea
            rows={2}
            value={passkeyPrivateExponent}
            onChange={(e) => onPasskeyPrivateExponentChange(e.target.value)}
            className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono resize-none text-[11px]"
            placeholder={t('vaultForm.passkey.privateExponentPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}
