import { Clock, KeyRound, RefreshCw, Trash2 } from 'lucide-react';
import { VaultItem } from '../types';
import { getTrashRemainingDays } from '../lib/display';

interface TrashItemCardProps {
  item: VaultItem;
  onRestore: (item: VaultItem) => void;
  onDeletePermanently: (item: VaultItem) => void;
}

export default function TrashItemCard({ item, onRestore, onDeletePermanently }: TrashItemCardProps) {
  const remainingDays = getTrashRemainingDays(item.deletedAt);

  return (
    <div
      data-testid="trash-list-item"
      className="bg-[#161816] hover:bg-[#1a1c1a] border border-outline-variant/15 hover:border-outline-variant/25 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all hover:scale-[1.01]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-high border border-outline-variant/20 flex items-center justify-center shrink-0">
            <KeyRound className="w-5 h-5 text-on-surface-variant" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-on-surface truncate">{item.title}</h3>
            <p className="text-on-surface-variant text-xs font-mono truncate">{item.username}</p>
          </div>
        </div>
        <span className="shrink-0 flex items-center gap-1 bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold px-2 py-1 rounded-full">
          <Clock className="w-3 h-3" />
          <span>{remainingDays} Gün Kaldı</span>
        </span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-outline-variant/10 text-xs">
        <span className="text-[10px] text-on-surface-variant">
          Silindi: {item.deletedAt ? new Date(item.deletedAt).toLocaleDateString('tr-TR') : 'Bilinmiyor'}
        </span>
        <div className="flex items-center gap-2">
          <button
            data-testid="restore-trash-item-button"
            onClick={() => onRestore(item)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary rounded-lg font-bold transition-all cursor-pointer"
            title="Kasaya Geri Yükle"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Geri Yükle</span>
          </button>
          <button
            data-testid="permanent-delete-trash-item-button"
            onClick={() => onDeletePermanently(item)}
            className="p-1.5 bg-surface-high hover:bg-red-500/15 text-on-surface-variant hover:text-red-500 border border-outline-variant/15 rounded-lg transition-all cursor-pointer"
            title="Kalıcı Olarak Sil"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
