/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Lock, User, Calendar } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface VaultFormIdentityFieldsProps {
  idNumber: string;
  onIdNumberChange: (val: string) => void;
  idFullName: string;
  onIdFullNameChange: (val: string) => void;
  idBirthDate: string;
  onIdBirthDateChange: (val: string) => void;
  idExpiryDate: string;
  onIdExpiryDateChange: (val: string) => void;
  idGender: string;
  onIdGenderChange: (val: string) => void;
}

export function VaultFormIdentityFields({
  idNumber,
  onIdNumberChange,
  idFullName,
  onIdFullNameChange,
  idBirthDate,
  onIdBirthDateChange,
  idExpiryDate,
  onIdExpiryDateChange,
  idGender,
  onIdGenderChange,
}: VaultFormIdentityFieldsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 animate-fade-in text-left">
      <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
        <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.identity.title')}</h4>
        <p className="text-[10px] text-on-surface-variant">{t('vaultForm.identity.description')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.identity.documentNumber')}
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="text"
              value={idNumber}
              onChange={(e) => onIdNumberChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-semibold font-mono"
              placeholder={t('vaultForm.identity.documentNumberPlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.identity.fullName')}
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="text"
              value={idFullName}
              onChange={(e) => onIdFullNameChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-semibold"
              placeholder={t('vaultForm.identity.fullNamePlaceholder')}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.identity.birthDate')}
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="date"
              value={idBirthDate}
              onChange={(e) => onIdBirthDateChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2 px-2 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.identity.expiryDate')}
          </label>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              type="date"
              value={idExpiryDate}
              onChange={(e) => onIdExpiryDateChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2 px-2 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.identity.gender')}
          </label>
          <select
            value={idGender}
            onChange={(e) => onIdGenderChange(e.target.value)}
            className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
          >
            <option value="Male">{t('vaultForm.identity.genderMale')}</option>
            <option value="Female">{t('vaultForm.identity.genderFemale')}</option>
            <option value="Other">{t('vaultForm.identity.genderOther')}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
