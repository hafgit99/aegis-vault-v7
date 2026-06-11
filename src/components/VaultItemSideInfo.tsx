import { Calendar } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { TranslationKey } from '../i18n/translations';
import { VaultItem } from '../types';

interface VaultItemSideInfoProps {
  item: VaultItem;
}

function getCategoryLabelKey(category: VaultItem['category']): TranslationKey {
  switch (category) {
    case 'card':
      return 'detail.category.card';
    case 'passkey':
      return 'detail.category.passkey';
    case 'identity':
      return 'detail.category.identity';
    case 'secure_note':
      return 'detail.category.secureNote';
    case 'login':
    default:
      return 'detail.category.login';
  }
}

export default function VaultItemSideInfo({ item }: VaultItemSideInfoProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4 text-left">
      <div className="glass-panel p-5 rounded-xl space-y-3">
        <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('detail.side.title')}
        </label>
        <div className="flex justify-between items-center text-xs">
          <span className="text-on-surface-variant">{t('detail.side.created')}</span>
          <span className="text-on-surface font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-on-surface-variant" />
            <span>{item.createdAt}</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-xs border-t border-outline-variant/10 pt-2.5">
          <span className="text-on-surface-variant">{t('detail.side.updated')}</span>
          <span className="text-on-surface font-semibold flex items-center gap-1">
            <Calendar className="w-3 h-3 text-on-surface-variant" />
            <span>{item.updatedAt}</span>
          </span>
        </div>
        <div className="flex justify-between items-center text-xs border-t border-outline-variant/10 pt-2.5">
          <span className="text-on-surface-variant">{t('detail.side.category')}</span>
          <span className="text-brand-secondary font-bold md:text-[11px]">{t(getCategoryLabelKey(item.category))}</span>
        </div>
      </div>

      {item.category !== 'secure_note' && (
        <div className="bg-surface-high p-5 rounded-xl border border-outline-variant/10 space-y-2">
          <h5 className="font-bold text-xs uppercase tracking-wider text-on-surface">{t('detail.side.notesTitle')}</h5>
          <p className="text-xs text-on-surface-variant italic leading-relaxed break-words whitespace-pre-wrap">
            {item.notes || t('detail.side.emptyNotes')}
          </p>
        </div>
      )}
    </div>
  );
}
