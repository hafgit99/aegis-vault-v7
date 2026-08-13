/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User, KeyRound, Wand2, Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface VaultFormLoginFieldsProps {
  username: string;
  onUsernameChange: (val: string) => void;
  password: string;
  onPasswordChange: (val: string) => void;
  isPasswordVisible: boolean;
  onTogglePasswordVisibility: () => void;
  onAutoGeneratePassword: () => void;
  totpSecret: string;
  onTotpSecretChange: (val: string) => void;
}

export function VaultFormLoginFields({
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  isPasswordVisible,
  onTogglePasswordVisibility,
  onAutoGeneratePassword,
  totpSecret,
  onTotpSecretChange,
}: VaultFormLoginFieldsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 animate-fade-in text-left">
      <div className="border-l-2 border-brand-primary pl-3.5 py-0.5">
        <h4 className="text-xs font-bold text-on-surface">{t('vaultForm.login.title')}</h4>
        <p className="text-[10px] text-on-surface-variant">{t('vaultForm.login.description')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
            {t('vaultForm.login.username')}
          </label>
          <div className="relative">
            <User className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-username-input"
              type="text"
              required
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface"
              placeholder={t('vaultForm.login.usernamePlaceholder')}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5 flex justify-between items-center">
            <span>{t('vaultForm.login.password')}</span>
            <button
              type="button"
              onClick={onAutoGeneratePassword}
              className="text-[9px] text-brand-primary hover:underline flex items-center gap-0.5"
            >
              <Wand2 className="w-3 h-3" />
              <span>{t('vaultForm.login.generateStrong')}</span>
            </button>
          </label>
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
            <input
              data-testid="vault-item-password-input"
              type={isPasswordVisible ? 'text' : 'password'}
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-20 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface font-mono"
              placeholder={t('vaultForm.login.passwordPlaceholder')}
            />
            <div className="absolute right-3 top-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={onTogglePasswordVisibility}
                className="text-on-surface-variant hover:text-brand-primary transition-colors p-1.5"
                title={isPasswordVisible ? t('vaultForm.login.hide') : t('vaultForm.login.show')}
              >
                {isPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={onAutoGeneratePassword}
                className="text-on-surface-variant hover:text-brand-primary transition-colors p-1.5"
                title={t('vaultForm.login.generatePasswordTitle')}
              >
                <Wand2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
          {t('vaultForm.login.totp')}
        </label>
        <div className="relative">
          <KeyRound className="w-4 h-4 absolute left-3 top-3.5 text-on-surface-variant/40" />
          <input
            type="text"
            value={totpSecret}
            onChange={(e) => onTotpSecretChange(e.target.value)}
            className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface uppercase font-mono"
            placeholder={t('vaultForm.login.totpPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
}
