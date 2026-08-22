/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { CheckCircle, Key, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';
import type { TranslationKey } from '../../i18n/translations';

type TFunction = (key: TranslationKey) => string;

interface SettingsPasswordCardProps {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  passwordError: string | null;
  passwordSuccess: boolean;
  onOldPasswordChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  t: TFunction;
}

export function SettingsPasswordCard({
  oldPassword,
  newPassword,
  confirmPassword,
  passwordError,
  passwordSuccess,
  onOldPasswordChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  t,
}: SettingsPasswordCardProps) {
  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl md:col-span-2 space-y-4" id="change-pass-card">
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
        <Key className="w-4 h-4 text-brand-secondary" />
        <span>{t('settings.password.title')}</span>
      </h3>

      <div className="hidden sm:flex p-3 bg-brand-primary/10 border border-brand-primary/20 rounded-xl text-xs text-on-surface-variant leading-relaxed items-start gap-2">
        <ShieldCheck className="w-4 h-4 text-brand-primary shrink-0 mt-0.5" />
        <span>{t('settings.password.rotationNotice')}</span>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 pt-1" id="pass-change-form">
        {passwordError && (
          <div className="p-3 bg-brand-error/10 border border-brand-error/20 rounded-lg text-brand-error text-xs flex gap-2 items-center">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}
        {passwordSuccess && (
          <div className="p-3 bg-brand-tertiary/10 border border-brand-tertiary/20 rounded-lg text-brand-tertiary text-xs flex gap-2 items-center animate-pulse">
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{t('settings.password.success')}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
              {t('settings.password.current')}
            </label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => onOldPasswordChange(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
              placeholder="????????"
              required
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
              {t('settings.password.new')}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => onNewPasswordChange(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              data-form-type="other"
              className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
              placeholder="????????"
              required
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-on-surface-variant/85 uppercase mb-1.5">
            {t('settings.password.confirm')}
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => onConfirmPasswordChange(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
            data-form-type="other"
            className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/20 text-on-surface"
            placeholder="????????"
            required
          />
        </div>

        <button
          type="submit"
          className="px-5 py-2.5 bg-brand-primary text-brand-on-primary rounded-lg font-bold text-xs hover:brightness-110 active:scale-95 transition-all mt-1 cursor-pointer"
        >
          {t('settings.password.update')}
        </button>
      </form>
    </div>
  );
}
