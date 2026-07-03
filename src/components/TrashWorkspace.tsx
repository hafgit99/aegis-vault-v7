import { Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { VaultItem } from '../types';
import TrashEmptyState from './TrashEmptyState';
import TrashInfoBanner from './TrashInfoBanner';
import TrashItemCard from './TrashItemCard';

interface TrashWorkspaceProps {
  items: VaultItem[];
  onEmptyTrash: () => void;
  onRestore: (item: VaultItem) => void;
  onDeletePermanently: (item: VaultItem) => void;
}

export default function TrashWorkspace({
  items,
  onEmptyTrash,
  onRestore,
  onDeletePermanently,
}: TrashWorkspaceProps) {
  const { t } = useLanguage();
  const [visibleCount, setVisibleCount] = useState(80);

  const displayedItems = items.slice(0, visibleCount);

  return (
    <div
      data-testid="trash-workspace"
      className="flex-1 overflow-y-auto scrollbar-hide max-w-5xl mx-auto w-full space-y-4 sm:space-y-6 animate-fade-in pb-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 border-b border-outline-variant/10 pb-4 sm:pb-6">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-on-surface flex items-center gap-3">
            <Trash2 className="w-6 h-6 sm:w-7 sm:h-7 text-red-500" />
            <span>{t('trash.workspace.title')}</span>
          </h1>
          <p className="hidden sm:block text-on-surface-variant text-xs mt-1">
            {t('trash.workspace.description')}
          </p>
        </div>

        {items.length > 0 && (
          <button
            data-testid="empty-trash-button"
            onClick={onEmptyTrash}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl font-bold text-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>{t('trash.workspace.emptyTrash')}</span>
          </button>
        )}
      </div>

      <TrashInfoBanner />

      {items.length === 0 ? (
        <TrashEmptyState />
      ) : (
        <div className="space-y-3 sm:space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {displayedItems.map((item) => (
              <Fragment key={item.id}>
                <TrashItemCard
                  item={item}
                  onRestore={onRestore}
                  onDeletePermanently={onDeletePermanently}
                />
              </Fragment>
            ))}
          </div>

          {items.length > visibleCount && (
            <button
              onClick={() => setVisibleCount((prev) => Math.min(prev + 100, items.length))}
              className="w-full py-2.5 mt-4 text-xs font-bold bg-surface-low hover:bg-surface-medium border border-outline-variant/10 hover:border-outline-variant/20 rounded-xl transition-all cursor-pointer text-brand-primary flex justify-center items-center gap-1 shadow-sm"
            >
              <span>{t('common.loadMore', 'Daha Fazla Göster') || 'Load More'}</span>
              <span className="opacity-60">({items.length - visibleCount})</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
