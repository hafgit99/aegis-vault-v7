import { Trash2 } from 'lucide-react';
import { Fragment } from 'react';

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

  return (
    <div
      data-testid="trash-workspace"
      className="flex-1 p-6 lg:p-10 overflow-y-auto scrollbar-hide max-w-5xl mx-auto w-full space-y-8 animate-fade-in"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/10 pb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-on-surface flex items-center gap-3">
            <Trash2 className="w-7 h-7 text-red-500" />
            <span>{t('trash.workspace.title')}</span>
          </h1>
          <p className="text-on-surface-variant text-xs mt-1">
            {t('trash.workspace.description')}
          </p>
        </div>

        {items.length > 0 && (
          <button
            onClick={onEmptyTrash}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl font-bold text-xs transition-colors cursor-pointer"
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((item) => (
            <Fragment key={item.id}>
              <TrashItemCard
                item={item}
                onRestore={onRestore}
                onDeletePermanently={onDeletePermanently}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
