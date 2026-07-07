/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Folder, Heart, Tag, Trash2, X } from 'lucide-react';
import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import type { VaultFolder, VaultItem } from '../types';

interface BulkActionBarProps {
  selectedIds: Set<string>;
  selectedItems: VaultItem[];
  folders: VaultFolder[];
  library: { name: string; color: string }[];
  onClear: () => void;
  onApply: (action: BulkActionDescriptor) => void;
}

export type BulkActionDescriptor =
  | { kind: 'delete' }
  | { kind: 'favorite' }
  | { kind: 'unfavorite' }
  | { kind: 'addTag'; tag: string }
  | { kind: 'removeTag'; tag: string }
  | { kind: 'moveToFolder'; folderId: string | null }
  | { kind: 'removeFromFolder' };

/**
 * Sticky action bar that appears at the top of the vault list when
 * the user has selected one or more items. Provides quick bulk
 * operations: delete, favourite toggle, tag, move-to-folder.
 */
export default function BulkActionBar({
  selectedIds,
  selectedItems,
  folders,
  library,
  onClear,
  onApply,
}: BulkActionBarProps) {
  const { t } = useLanguage();
  const [tagDraft, setTagDraft] = useState('');
  const [folderDraft, setFolderDraft] = useState('');

  if (selectedIds.size === 0) return null;

  const count = selectedIds.size;
  const handleApply = (action: BulkActionDescriptor) => {
    onApply(action);
    setTagDraft('');
    setFolderDraft('');
  };

  return (
    <div
      data-testid="bulk-action-bar"
      role="toolbar"
      aria-label={t('bulk.title')}
      className="sticky top-0 z-20 -mx-3 px-3 py-2 mb-2 border-b border-outline-variant/15 bg-brand-primary/10 backdrop-blur flex flex-wrap items-center gap-2 text-xs"
    >
      <span className="inline-flex items-center gap-1.5 font-bold text-brand-primary">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-primary text-white text-[11px] font-mono" data-testid="bulk-count">{count}</span>
        {t('bulk.selected')}
      </span>
      <span className="h-4 w-px bg-outline-variant/30 mx-1" aria-hidden="true" />
      <button
        type="button"
        data-testid="bulk-favorite"
        onClick={() => {
          const allFav = selectedItems.every((item) => item.favorite);
          handleApply({ kind: allFav ? 'unfavorite' : 'favorite' });
        }}
        className="inline-flex items-center gap-1 rounded-md border border-outline-variant/20 bg-surface-lowest text-on-surface px-2 py-1 hover:border-brand-primary/40 cursor-pointer focus:outline-none"
      >
        <Heart className="w-3.5 h-3.5" aria-hidden="true" />
        {t('bulk.toggleFav')}
      </button>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (tagDraft.trim()) handleApply({ kind: 'addTag', tag: tagDraft.trim() });
        }}
        className="inline-flex items-center gap-1"
      >
        <Tag className="w-3.5 h-3.5 text-on-surface-variant" aria-hidden="true" />
        <input
          type="text"
          data-testid="bulk-tag-input"
          value={tagDraft}
          onChange={(event) => setTagDraft(event.target.value)}
          list="bulk-tag-library"
          placeholder={t('bulk.addTagPlaceholder')}
          className="bg-surface-lowest border border-outline-variant/20 rounded-md px-1.5 py-1 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
        />
        <datalist id="bulk-tag-library">
          {library.map((entry) => (
            <option key={entry.name} value={entry.name} />
          ))}
        </datalist>
        <button
          type="submit"
          data-testid="bulk-add-tag"
          disabled={!tagDraft.trim()}
          className="rounded-md border border-brand-primary/30 bg-brand-primary/15 text-brand-primary px-2 py-1 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
        >
          {t('bulk.add')}
        </button>
      </form>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (folderDraft === '__none__') handleApply({ kind: 'removeFromFolder' });
          else if (folderDraft) handleApply({ kind: 'moveToFolder', folderId: folderDraft });
        }}
        className="inline-flex items-center gap-1"
      >
        <Folder className="w-3.5 h-3.5 text-on-surface-variant" aria-hidden="true" />
        <select
          data-testid="bulk-folder-select"
          value={folderDraft}
          onChange={(event) => setFolderDraft(event.target.value)}
          className="bg-surface-lowest border border-outline-variant/20 rounded-md px-1.5 py-1 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
        >
          <option value="">{t('bulk.moveToFolderPlaceholder')}</option>
          <option value="__none__">{t('bulk.noFolder')}</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
        <button
          type="submit"
          data-testid="bulk-move"
          disabled={!folderDraft}
          className="rounded-md border border-outline-variant/20 bg-surface-lowest text-on-surface px-2 py-1 font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none"
        >
          {t('bulk.move')}
        </button>
      </form>

      <button
        type="button"
        data-testid="bulk-delete"
        onClick={() => handleApply({ kind: 'delete' })}
        className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 px-2 py-1 hover:bg-red-500/15 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-300/40"
      >
        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
        {t('bulk.delete')}
      </button>

      <button
        type="button"
        data-testid="bulk-clear"
        onClick={onClear}
        className="ml-auto inline-flex items-center gap-1 rounded-md text-on-surface-variant hover:text-on-surface px-1.5 py-1 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
        title={t('bulk.clearSelection')}
        aria-label={t('bulk.clearSelection')}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" />
        {t('bulk.clear')}
      </button>
    </div>
  );
}
