/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, CreditCard, Calendar, Lock, KeyRound } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface VaultFormCardFieldsProps {
  cardholderName: string;
  onCardholderNameChange: (val: string) => void;
  cardNumber: string;
  onCardNumberChange: (val: string) => void;
  cardExpiry: string;
  onCardExpiryChange: (val: string) => void;
  cardCvv: string;
  onCardCvvChange: (val: string) => void;
  cardPin: string;
  onCardPinChange: (val: string) => void;
}

export function VaultFormCardFields({
  cardholderName,
  onCardholderNameChange,
  cardNumber,
  onCardNumberChange,
  cardExpiry,
  onCardExpiryChange,
  cardCvv,
  onCardCvvChange,
  cardPin,
  onCardPinChange,
}: VaultFormCardFieldsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 animate-fade-in text-left">
      <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
        <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.card.title')}</h4>
        <p className="text-[10px] text-on-surface-variant">{t('vaultForm.card.description')}</p>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
          {t('vaultForm.card.cardholder')}
        </label>
        <div className="relative">
          <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
          <input
            type="text"
            value={cardholderName}
            onChange={(e) => onCardholderNameChange(e.target.value)}
            className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
            placeholder={t('vaultForm.card.cardholderPlaceholder')}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.card.number')}
          </label>
          <div className="relative">
            <CreditCard className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="text"
              value={cardNumber}
              onChange={(e) => onCardNumberChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.card.numberPlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.card.expiry')}
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="text"
              value={cardExpiry}
              onChange={(e) => onCardExpiryChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.card.expiryPlaceholder')}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.card.cvv')}
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="password"
              maxLength={4}
              value={cardCvv}
              onChange={(e) => onCardCvvChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.card.cvvPlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.card.pin')}
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="password"
              maxLength={6}
              value={cardPin}
              onChange={(e) => onCardPinChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.card.pinPlaceholder')}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
