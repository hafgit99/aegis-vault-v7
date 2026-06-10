import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { generateTOTP } from '../lib/otp';
import { VaultItem } from '../types';

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
  if (item.category !== 'login') return null;

  const totpCode = item.totpSecret ? generateTOTP(item.totpSecret) : '';

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          KULLANICI ADI VEYA E-POSTA
        </label>
        <div className="flex items-center justify-between">
          <span className="font-bold text-base text-on-surface break-all">{item.username}</span>
          <button
            onClick={() => onCopyText(item.username, 'username')}
            className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer shrink-0 ml-2"
            title="Kopyala"
          >
            {copiedField === 'username' ? (
              <Check className="w-4 h-4 text-brand-tertiary" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          PAROLA (PASSWORD)
        </label>
        <div className="flex items-center justify-between">
          <span className="font-mono text-base tracking-wider break-all text-on-surface select-all">
            {isPasswordRevealed ? item.password || '(Boş Şifre)' : '••••••••••••••••'}
          </span>
          <div className="flex items-center gap-2 shrink-0 ml-2">
            <button
              onClick={onTogglePasswordReveal}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
              title={isPasswordRevealed ? 'Gizle' : 'Göster'}
            >
              {isPasswordRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onCopyText(item.password || '', 'password')}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
              title="Kopyala"
            >
              {copiedField === 'password' ? (
                <Check className="w-4 h-4 text-brand-tertiary" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 flex justify-between">
          <span>İKİ FAKTÖRLÜ DOĞRULAMA (2FA TOTP CODES)</span>
          {item.totpSecret && <span className="text-brand-primary font-mono lowercase">mfa yetkin</span>}
        </label>
        <div className="flex items-center justify-between">
          {item.totpSecret ? (
            <>
              <span className="font-mono text-xl md:text-2xl font-bold text-brand-primary tracking-widest">
                {totpCode}
              </span>
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] text-on-surface-variant font-mono bg-[#141614] px-2.5 py-1 rounded-md border border-outline-variant/15 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-ping"></span>
                  <span>{totpCountdown} sn kaldı</span>
                </span>
                <button
                  onClick={() => onCopyText(totpCode.replace(' ', ''), 'totp')}
                  className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                  title="Doğrulama Kodunu Kopyala"
                >
                  {copiedField === 'totp' ? (
                    <Check className="w-4 h-4 text-brand-tertiary" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </>
          ) : (
            <div className="text-xs text-on-surface-variant/40 italic py-1 text-left">
              Bu hesapta OTP kurulumu aktif değil. Düzenleyip Gizli Anahtar girerek başlatabilirsiniz.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
