import { Check, Copy } from 'lucide-react';

import { VaultItem } from '../types';

interface IdentityDetailProps {
  item: VaultItem;
  copiedField: string | null;
  onCopyText: (text: string, field: string) => void;
}

function getGenderLabel(gender?: string): string {
  if (gender === 'Male') return 'Erkek / M';
  if (gender === 'Female') return 'Kadın / F';
  return 'Belirtilmedi';
}

export default function IdentityDetail({ item, copiedField, onCopyText }: IdentityDetailProps) {
  if (item.category !== 'identity') return null;

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5 rounded-xl bg-gradient-to-r from-surface-high to-surface-high/30">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          BELGEDEKİ TAM AD SOYAD
        </label>
        <div className="flex items-center justify-between">
          <span className="font-bold text-base text-on-surface uppercase select-all">{item.idFullName || 'Girilmedi'}</span>
          <button
            onClick={() => onCopyText(item.idFullName || '', 'idFullName')}
            className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
          >
            {copiedField === 'idFullName' ? (
              <Check className="w-4 h-4 text-brand-tertiary" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="glass-panel p-5 rounded-xl">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          BELGE / KİMLİK / PASAPORT NUMARASI
        </label>
        <div className="flex items-center justify-between">
          <span className="font-mono text-base font-bold text-brand-primary tracking-widest">{item.username}</span>
          <button
            onClick={() => onCopyText(item.username, 'idNumber')}
            className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
          >
            {copiedField === 'idNumber' ? (
              <Check className="w-4 h-4 text-brand-tertiary" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel p-4 rounded-xl">
          <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
            DOĞUM TARİHİ
          </label>
          <span className="text-xs text-on-surface font-semibold">{item.idBirthDate || 'Belirtilmedi'}</span>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
            SON GEÇERLİLİK
          </label>
          <span className="text-xs text-on-surface font-semibold">{item.idExpiryDate || 'Sınırsız / Yok'}</span>
        </div>

        <div className="glass-panel p-4 rounded-xl">
          <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
            CİNSİYET
          </label>
          <span className="text-xs text-brand-secondary font-bold uppercase">{getGenderLabel(item.idGender)}</span>
        </div>
      </div>
    </div>
  );
}
