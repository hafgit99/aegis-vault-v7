import { Calendar } from 'lucide-react';

import { VaultItem } from '../types';

interface VaultItemSideInfoProps {
  item: VaultItem;
}

function getCategoryLabel(category: VaultItem['category']): string {
  switch (category) {
    case 'card':
      return 'Ödeme Kartı';
    case 'passkey':
      return 'Passkey / API';
    case 'identity':
      return 'Kimlik Belgesi';
    case 'secure_note':
      return 'Güvenli Not';
    case 'login':
    default:
      return 'Giriş Bilgisi';
  }
}

export default function VaultItemSideInfo({ item }: VaultItemSideInfoProps) {
  return (
    <div className="space-y-4 text-left">
      <div className="glass-panel p-5 rounded-xl space-y-3">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          BİLGİLER VE TARİHÇE
        </label>
        <div className="flex justify-between items-center text-xs">
          <span className="text-on-surface-variant">Oluşturuldu</span>
          <span className="text-on-surface font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-on-surface-variant" />
            <span>{item.createdAt}</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-xs border-t border-outline-variant/10 pt-2.5">
          <span className="text-on-surface-variant">Son Değişiklik</span>
          <span className="text-on-surface font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-on-surface-variant" />
            <span>{item.updatedAt}</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-xs border-t border-outline-variant/10 pt-2.5">
          <span className="text-on-surface-variant">Kasa Kategorisi</span>
          <span className="text-brand-secondary font-bold md:text-[11px]">{getCategoryLabel(item.category)}</span>
        </div>
      </div>

      {item.category !== 'secure_note' && (
        <div className="bg-surface-high p-5 rounded-xl border border-outline-variant/10 space-y-2">
          <h5 className="font-bold text-xs uppercase tracking-wider text-on-surface">Özel Notlar</h5>
          <p className="text-xs text-on-surface-variant italic leading-relaxed break-words whitespace-pre-wrap">
            {item.notes || 'Herhangi bir özel kurtarma veya yedek kod notu eklenmedi.'}
          </p>
        </div>
      )}
    </div>
  );
}
