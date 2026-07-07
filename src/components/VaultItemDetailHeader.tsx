import { Check, Edit, ExternalLink, Heart, Share2, Trash2, QrCode } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { getLogoForPlatform } from '../lib/display';
import { VaultItem } from '../types';

interface VaultItemDetailHeaderProps {
  item: VaultItem;
  copiedField: string | null;
  onToggleFavorite: (item: VaultItem) => void | Promise<void>;
  onEdit: () => void;
  onCopyText: (text: string, field: string) => void;
  onDelete: (id: string) => void;
  onSecureShare?: () => void;
}

export default function VaultItemDetailHeader({
  item,
  copiedField,
  onToggleFavorite,
  onEdit,
  onCopyText,
  onDelete,
  onSecureShare,
}: VaultItemDetailHeaderProps) {
  const { t } = useLanguage();
  const logoUrl = getLogoForPlatform(item.title, item.url);

  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-outline-variant/10 animate-fade-in">
      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
        <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-surface-high flex items-center justify-center border border-outline-variant/30 custom-shadow overflow-hidden shrink-0">
          {logoUrl ? (
            <img
              alt={`${item.title} Logo`}
              className="w-9 h-9 sm:w-12 sm:h-12 object-contain"
              referrerPolicy="no-referrer"
              src={logoUrl}
            />
          ) : (
            <span className="font-display font-bold text-2xl sm:text-3xl text-brand-primary">
              {item.title.charAt(0).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-xl sm:text-2xl font-bold text-on-surface flex items-center gap-2 min-w-0">
            <span className="truncate">{item.title}</span>
            {item.favorite && <Heart className="w-5 h-5 fill-red-500 text-red-500 shrink-0" />}
          </h1>
          {item.url && (
            <a
              className="text-brand-primary hover:underline text-xs flex items-center gap-1 mt-1.5 font-semibold min-w-0"
              href={`https://${item.url}`}
              target="_blank"
              rel="noreferrer"
            >
              <span className="truncate">{item.url}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="flex gap-2 sm:gap-2.5 overflow-x-auto scrollbar-hide pb-0.5">
        <button
          data-testid="toggle-favorite-button"
          onClick={() => {
            void onToggleFavorite(item);
          }}
          className={`p-2.5 rounded-lg transition-all cursor-pointer border border-outline-variant/10 bg-surface-high hover:bg-[#202220] ${
            item.favorite ? 'text-red-500' : 'text-on-surface-variant hover:text-red-400'
          }`}
          title={item.favorite ? t('detail.header.removeFavorite') : t('detail.header.addFavorite')}
        >
          <Heart className={`w-4.5 h-4.5 ${item.favorite ? 'fill-red-500' : ''}`} />
        </button>
        <button
          onClick={onEdit}
          className="p-2.5 rounded-lg bg-surface-high text-on-surface-variant hover:text-brand-primary hover:bg-[#202220] transition-all cursor-pointer border border-outline-variant/10"
          title={t('detail.header.edit')}
        >
          <Edit className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={onSecureShare}
          className="p-2.5 rounded-lg bg-surface-high text-on-surface-variant hover:text-brand-primary hover:bg-[#202220] transition-all cursor-pointer border border-outline-variant/10"
          title={t('detail.header.secureShare') || 'Secure Share / Güvenli Paylaş'}
        >
          <QrCode className="w-4.5 h-4.5" />
        </button>
        <button
          onClick={() => onCopyText(JSON.stringify(item, null, 2), 'item_export')}
          className="p-2.5 rounded-lg bg-surface-high text-on-surface-variant hover:text-brand-primary hover:bg-[#202220] transition-all cursor-pointer border border-outline-variant/10"
          title={t('detail.header.copyJson')}
        >
          {copiedField === 'item_export' ? (
            <Check className="w-4.5 h-4.5 text-brand-tertiary" />
          ) : (
            <Share2 className="w-4.5 h-4.5" />
          )}
        </button>
        <button
          data-testid="delete-vault-item-button"
          onClick={() => onDelete(item.id)}
          className="p-2.5 rounded-lg bg-surface-high text-brand-error hover:bg-brand-error/15 hover:text-brand-error transition-all cursor-pointer border border-outline-variant/10"
          title={t('detail.header.delete')}
        >
          <Trash2 className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
}
