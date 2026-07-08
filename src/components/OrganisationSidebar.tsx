/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Filter, Plus, Sparkles, Tag as TagIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import {
  buildContext as buildSmartContext,
  countSmartFolder,
  type CreateSmartFolderInput,
} from '../lib/smartFolders';
import { ROOT_FOLDER_ID, subtreeOf } from '../lib/folders';
import type { SmartFolder, TagColorKey, TagDefinition, VaultFolder, VaultItem } from '../types';
import FolderTree from './FolderTree';
import SmartFolderCard from './SmartFolderCard';
import TagManager from './TagManager';

interface OrganisationSidebarProps {
  folders: VaultFolder[];
  tags: TagDefinition[];
  smartFolders: SmartFolder[];
  smartFolderCounts: Record<string, number>;
  items: VaultItem[];
  activeFolderId: string | null;
  activeSmartFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onSelectSmartFolder: (id: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onCreateTag: (input: { name: string; color?: TagColorKey }) => TagDefinition | null;
  onDeleteTag: (id: string) => void;
  onCreateSmartFolder: (input: CreateSmartFolderInput) => SmartFolder;
  onDeleteSmartFolder: (id: string) => void;
  onUpdateTag: (id: string, patch: { name?: string; color?: TagColorKey }) => void;
  isOpen?: boolean;
}

/**
 * The 5.3 organisation sidebar. Renders the folder tree, the smart
 * folder cards and a button that opens the tag manager. Designed to
 * live to the left of the vault list and be the user's primary
 * navigation surface once they accumulate more than a handful of
 * items.
 */
export default function OrganisationSidebar({
  folders,
  tags,
  smartFolders,
  smartFolderCounts,
  items,
  activeFolderId,
  activeSmartFolderId,
  onSelectFolder,
  onSelectSmartFolder,
  onCreateFolder,
  onDeleteFolder,
  onCreateTag,
  onUpdateTag,
  onDeleteTag,
  onCreateSmartFolder,
  onDeleteSmartFolder,
  isOpen = false,
}: OrganisationSidebarProps) {
  const { t } = useLanguage();
  const [tagManagerOpen, setTagManagerOpen] = useState(false);

  // Build a count map for the folder tree: each folder plus all its
  // descendants. We include the implicit root so the user can see
  // "all items" in the chip.
  const itemCountByFolder = useMemo(() => {
    const counts: Record<string, number> = {};
    const inc = (id: string) => {
      counts[id] = (counts[id] ?? 0) + 1;
    };
    for (const item of items) {
      if (item.folderId) {
        const ids = subtreeOf(folders, item.folderId).map((entry) => entry.id);
        ids.forEach(inc);
        inc(ROOT_FOLDER_ID);
      } else {
        inc(ROOT_FOLDER_ID);
      }
    }
    return counts;
  }, [folders, items]);

  const tagUsage = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      for (const tag of item.tags ?? []) {
        const slug = tag.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        map[slug] = (map[slug] ?? 0) + 1;
      }
    }
    return map;
  }, [items]);

  const orderedSmartFolders = useMemo(() => {
    const builtIns = smartFolders.filter((entry) => entry.builtIn);
    const userFolders = smartFolders.filter((entry) => !entry.builtIn);
    return [...builtIns, ...userFolders];
  }, [smartFolders]);

  const liveCounts = useMemo(() => {
    const ctx = buildSmartContext(items);
    const map: Record<string, number> = {};
    for (const folder of smartFolders) {
      map[folder.id] = countSmartFolder(folder, items, ctx);
    }
    return map;
  }, [items, smartFolders]);

  return (
    <aside
      data-testid="organisation-sidebar"
      aria-label={t('organisation.title')}
      className={`fixed lg:static left-0 top-0 h-full lg:h-auto w-[280px] lg:w-[260px] xl:w-[300px] bg-surface-lowest lg:bg-surface-lowest/40 border-r border-outline-variant/15 flex flex-col overflow-y-auto z-40 lg:z-auto transition-transform duration-300 lg:transition-none lg:translate-x-0 ${
        isOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="p-4 space-y-4">
        <section aria-labelledby="org-section-folders">
          <header className="flex items-center justify-between mb-2">
            <h2 id="org-section-folders" className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <Filter className="w-3 h-3" aria-hidden="true" />
              {t('organisation.folders')}
            </h2>
            <button
              type="button"
              data-testid="org-new-folder"
              onClick={() => onCreateFolder(null)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary hover:text-brand-primary/80 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 rounded px-1 py-0.5"
              title={t('folders.create')}
              aria-label={t('folders.create')}
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              {t('folders.new')}
            </button>
          </header>
          <FolderTree
            folders={folders}
            activeFolderId={activeFolderId}
            onSelect={(id) => {
              onSelectSmartFolder(null);
              onSelectFolder(id);
            }}
            itemCountByFolder={itemCountByFolder}
            onCreateFolder={onCreateFolder}
            onDeleteFolder={onDeleteFolder}
            onRenameFolder={() => {}}
          />
        </section>

        <section aria-labelledby="org-section-smart">
          <header className="flex items-center justify-between mb-2">
            <h2 id="org-section-smart" className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              {t('organisation.smartFolders')}
            </h2>
            <button
              type="button"
              data-testid="org-new-smart-folder"
              onClick={() => {
                const name = window.prompt(t('smartFolders.createPrompt'));
                if (!name) return;
                onCreateSmartFolder({ name, rules: [{ kind: 'favorite' }] });
              }}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary hover:text-brand-primary/80 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 rounded px-1 py-0.5"
              title={t('smartFolders.create')}
              aria-label={t('smartFolders.create')}
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              {t('smartFolders.new')}
            </button>
          </header>
          <div className="space-y-1.5">
            {orderedSmartFolders.map((folder) => (
              <SmartFolderCard
                key={folder.id}
                folder={folder}
                count={liveCounts[folder.id] ?? smartFolderCounts[folder.id] ?? 0}
                isActive={activeSmartFolderId === folder.id}
                onSelect={() => {
                  onSelectFolder(null);
                  onSelectSmartFolder(folder.id);
                }}
                onDelete={folder.builtIn ? undefined : () => onDeleteSmartFolder(folder.id)}
              />
            ))}
          </div>
        </section>

        <section aria-labelledby="org-section-tags">
          <header className="flex items-center justify-between mb-2">
            <h2 id="org-section-tags" className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <TagIcon className="w-3 h-3" aria-hidden="true" />
              {t('organisation.tags')}
            </h2>
            <button
              type="button"
              data-testid="org-manage-tags"
              onClick={() => setTagManagerOpen(true)}
              className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-primary hover:text-brand-primary/80 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 rounded px-1 py-0.5"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              {t('tags.manage')}
            </button>
          </header>
          <div className="flex flex-wrap gap-1.5" data-testid="org-tag-pills">
            {tags.length === 0 ? (
              <p className="text-[10px] text-on-surface-variant/60 italic">{t('tags.noTags')}</p>
            ) : (
              tags.map((entry) => (
                <span
                  key={entry.id}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    ({
                      rose: 'bg-rose-500/20 text-rose-100 border-rose-500/30',
                      pink: 'bg-pink-500/20 text-pink-100 border-pink-500/30',
                      fuchsia: 'bg-fuchsia-500/20 text-fuchsia-100 border-fuchsia-500/30',
                      purple: 'bg-purple-500/20 text-purple-100 border-purple-500/30',
                      violet: 'bg-violet-500/20 text-violet-100 border-violet-500/30',
                      indigo: 'bg-indigo-500/20 text-indigo-100 border-indigo-500/30',
                      blue: 'bg-blue-500/20 text-blue-100 border-blue-500/30',
                      sky: 'bg-sky-500/20 text-sky-100 border-sky-500/30',
                      cyan: 'bg-cyan-500/20 text-cyan-100 border-cyan-500/30',
                      teal: 'bg-teal-500/20 text-teal-100 border-teal-500/30',
                      emerald: 'bg-emerald-500/20 text-emerald-100 border-emerald-500/30',
                      green: 'bg-green-500/20 text-green-100 border-green-500/30',
                      lime: 'bg-lime-500/20 text-lime-100 border-lime-500/30',
                      yellow: 'bg-yellow-500/20 text-yellow-100 border-yellow-500/30',
                      amber: 'bg-amber-500/20 text-amber-100 border-amber-500/30',
                      orange: 'bg-orange-500/20 text-orange-100 border-orange-500/30',
                      red: 'bg-red-500/20 text-red-100 border-red-500/30',
                      slate: 'bg-slate-500/20 text-slate-100 border-slate-500/30',
                    } as Record<string, string>)[entry.color]
                  }`}
                >
                  {entry.name}
                </span>
              ))
            )}
          </div>
        </section>
      </div>

      <TagManager
        open={tagManagerOpen}
        onClose={() => setTagManagerOpen(false)}
        library={tags}
        tagUsage={tagUsage}
        onCreate={onCreateTag}
        onUpdate={onUpdateTag}
        onDelete={onDeleteTag}
      />
    </aside>
  );
}