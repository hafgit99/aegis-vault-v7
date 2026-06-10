import { Check, Copy, Eye, EyeOff } from 'lucide-react';

import { VaultItem } from '../types';

const HIDDEN_SECRET = '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••';

interface PasskeyDetailProps {
  item: VaultItem;
  copiedField: string | null;
  isPrivateExponentRevealed: boolean;
  onToggleReveal: () => void;
  onCopyText: (text: string, field: string) => void;
}

export default function PasskeyDetail({
  item,
  copiedField,
  isPrivateExponentRevealed,
  onToggleReveal,
  onCopyText,
}: PasskeyDetailProps) {
  if (item.category !== 'passkey') return null;

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          HİZMET ADI
        </label>
        <div className="flex items-center justify-between">
          <span className="font-bold text-base text-on-surface">{item.passkeyService || 'Google Login'}</span>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          ORTAK ANAHTAR ORTAK ID (PUBLIC KEY ID)
        </label>
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm text-on-surface break-all">{item.username || 'boş'}</span>
          <button
            onClick={() => onCopyText(item.username || '', 'passkeyPublicId')}
            className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer ml-2 shrink-0"
          >
            {copiedField === 'passkeyPublicId' ? (
              <Check className="w-4 h-4 text-brand-tertiary" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          BİLİNMEYEN ÖZEL BİLEŞEN (PRIVATE KEY / SECURE SHIELDS EXPONENT)
        </label>
        <div className="flex items-start justify-between">
          <span className="font-mono text-xs text-on-surface-variant select-all break-all leading-relaxed whitespace-pre bg-[#151715] p-3 rounded-lg border border-outline-variant/10 flex-1 mr-3 h-20 overflow-y-auto">
            {isPrivateExponentRevealed ? item.passkeyPrivateExponent || '(Değer Girilmedi)' : HIDDEN_SECRET}
          </span>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              onClick={onToggleReveal}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
            >
              {isPrivateExponentRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => onCopyText(item.passkeyPrivateExponent || '', 'passkeyPrivateExponent')}
              className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
              title="Kopyala"
            >
              {copiedField === 'passkeyPrivateExponent' ? (
                <Check className="w-4 h-4 text-brand-tertiary" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
