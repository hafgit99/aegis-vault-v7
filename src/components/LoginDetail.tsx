import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { generateTOTP, getTotpPeriod, TOTPValidationError } from '../lib/otp';
import type { VaultItem } from '../types';
import { TotpCountdownRing } from './totp/TotpCountdownRing';

interface LoginDetailProps {
  item: VaultItem;
  copiedField: string | null;
  isPasswordRevealed: boolean;
  totpCountdown: number;
  onTogglePasswordReveal: () => void;
  onCopyText: (text: string, field: string) => void;
}

export default function LoginDetail({
  item,
  copiedField,
  isPasswordRevealed,
  totpCountdown,
  onTogglePasswordReveal,
  onCopyText,
}: LoginDetailProps) {
  const { t } = useLanguage();
  const [totpCode, setTotpCode] = useState<string>('');
  const [hasTotpValidationError, setHasTotpValidationError] = useState<boolean>(false);
  const totpPeriod = getTotpPeriod(item.totpSecret);

  useEffect(() => {
    let active = true;
    if (item.category === 'login' && item.totpSecret) {
      generateTOTP(item.totpSecret)
        .then((code) => {
          if (active) {
            setTotpCode(code);
            setHasTotpValidationError(false);
          }
        })
        .catch((error) => {
          if (active) {
            const isValidationError = error instanceof TOTPValidationError || (error && (error as any).name === 'TOTPValidationError');
            setHasTotpValidationError(Boolean(isValidationError));
            if (isValidationError) {
              setTotpCode('000 000');
            }
          }
        });
    } else {
      setTotpCode('');
      setHasTotpValidationError(false);
    }
    return () => {
      active = false;
    };
  }, [item.category, item.totpSecret, totpCountdown]);

  if (item.category !== 'login') return null;

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('loginDetail.username')}
        </label>
        <div className="flex items-center justify-between">
          <span data-testid="login-username-value" className="font-bold text-base text-on-surface break-all">{item.username}</span>
          <button
            data-testid="login-username-copy-button"
            onClick={() => onCopyText(item.username, 'username')}
            className={`p-1.5 rounded-lg cursor-pointer shrink-0 ml-2 transition-all duration-300 focus:outline-none ${
              copiedField === 'username'
                ? 'ring-2 ring-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] scale-105'
                : 'text-on-surface-variant hover:text-brand-primary hover:bg-[#1a1c1a]/50'
            }`}
            title={t('loginDetail.copy')}
          >
            {copiedField === 'username' ? (
              <Check className="w-4 h-4 text-brand-tertiary animate-in zoom-in-50 duration-200" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('loginDetail.password')}
        </label>
        <div className="flex items-center justify-between">
          <span data-testid="login-password-value" className="font-mono text-base tracking-wider break-all text-on-surface select-all">
            {isPasswordRevealed ? item.password || t('loginDetail.emptyPassword') : '••••••••••••••••'}
          </span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              data-testid="login-password-reveal-button"
              onClick={onTogglePasswordReveal}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
              title={isPasswordRevealed ? t('loginDetail.hide') : t('loginDetail.show')}
            >
              {isPasswordRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              data-testid="login-password-copy-button"
              onClick={() => onCopyText(item.password || '', 'password')}
              className={`p-1.5 rounded-lg cursor-pointer transition-all duration-300 focus:outline-none ${
                copiedField === 'password'
                  ? 'ring-2 ring-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] scale-105'
                  : 'text-on-surface-variant hover:text-brand-primary hover:bg-[#1a1c1a]/50'
              }`}
              title={t('loginDetail.copy')}
            >
              {copiedField === 'password' ? (
                <Check className="w-4 h-4 text-brand-tertiary animate-in zoom-in-50 duration-200" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 flex justify-between">
          <span>{t('loginDetail.totp')}</span>
          {item.totpSecret && <span className="text-brand-primary font-mono lowercase">{t('loginDetail.mfaActive')}</span>}
        </label>
        <div className="flex items-center justify-between">
          {item.totpSecret ? (
            hasTotpValidationError ? (
              <div className="text-xs text-amber-300/90 py-1 text-left leading-relaxed">
                {t('loginDetail.invalidTotp')}
              </div>
            ) : (
              <>
                <span className="font-mono text-xl md:text-2xl font-bold text-brand-primary tracking-widest">
                  {totpCode}
                </span>
                <div className="flex items-center gap-2.5">
                  <TotpCountdownRing secondsLeft={totpCountdown} totalDuration={totpPeriod} />
                  <button
                    data-testid="login-totp-copy-button"
                    onClick={() => onCopyText(totpCode.replace(' ', ''), 'totp')}
                    className={`p-1.5 rounded-lg cursor-pointer transition-all duration-300 focus:outline-none ${
                      copiedField === 'totp'
                        ? 'ring-2 ring-emerald-400/50 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.35)] scale-105'
                        : 'text-on-surface-variant hover:text-brand-primary hover:bg-[#1a1c1a]/50'
                    }`}
                    title={t('loginDetail.copyTotp')}
                  >
                    {copiedField === 'totp' ? (
                      <Check className="w-4 h-4 text-brand-tertiary animate-in zoom-in-50 duration-200" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </>
            )
          ) : (
            <div className="text-xs text-on-surface-variant/40 italic py-1 text-left">
              {t('loginDetail.noTotp')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
