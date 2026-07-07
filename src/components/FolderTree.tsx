/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Archive,
  Briefcase,
  CreditCard,
  FileText,
  Folder as FolderIcon,
  Globe,
  Home,
  Inbox,
  KeyRound,
  Lock,
  Shield,
  Star,
  Tag as TagIcon,
  User,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import {
  ancestorsOf,
  buildTree,
  ROOT_FOLDER_ID,
} from '../lib/folders';
import { getPalette } from '../lib/tags';
import type { FolderIconKey, VaultFolder } from '../types';

const ICONS: Record<FolderIconKey, typeof FolderIcon> = {
  folder: FolderIcon,
  inbox: Inbox,
  star: Star,
  briefcase: Briefcase,
  home: Home,
  'credit-card': CreditCard,
  'key-round': KeyRound,
  shield: Shield,
  lock: Lock,
  tag: TagIcon,
  user: User,
  globe: Globe,
  archive: Archive,
  'file-text': FileText,
};

const PADDING_BY_DEPTH: Record<number, string> = {
  0: 'pl-[6px]',
  1: 'pl-[18px]',
  2: 'pl-[30px]',
  3: 'pl-[42px]',
  4: 'pl-[54px]',
  5: 'pl-[66px]',
  6: 'pl-[78px]',
  7: 'pl-[90px]',
  8: 'pl-[102px]',
};

interface FolderTreeProps {
  folders: VaultFolder[];
  activeFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  itemCountByFolder: Record<string, number>;
  onCreateFolder: (parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
}

export default function FolderTree({
  folders,
  activeFolderId,
  onSelect,
  itemCountByFolder,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
}: FolderTreeProps) {
  const tree = useMemo(() => buildTree(folders), [folders]);
  const topLevel = tree.get(null) ?? [];

  return (
    <nav data-testid="folder-tree" className="text-sm" aria-label="Folders">
      <ul className="space-y-0.5">
        <FolderRow
          icon={Inbox}
          iconClass="text-on-surface-variant/70"
          name="Root"
          count={itemCountByFolder[ROOT_FOLDER_ID] ?? 0}
          depth={0}
          isActive={activeFolderId === null || activeFolderId === ROOT_FOLDER_ID}
          onClick={() => onSelect(null)}
          onCreate={onCreateFolder ? () => onCreateFolder(null) : undefined}
        />
        {topLevel.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            depth={0}
            tree={tree}
            activeFolderId={activeFolderId}
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            onDeleteFolder={onDeleteFolder}
            onRenameFolder={onRenameFolder}
            itemCountByFolder={itemCountByFolder}
          />
        ))}
      </ul>
    </nav>
  );
}

interface FolderNodeProps {
  folder: VaultFolder;
  depth: number;
  tree: Map<string | null, VaultFolder[]>;
  activeFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreateFolder: (parentId: string | null) => void;
  onDeleteFolder: (folderId: string) => void;
  onRenameFolder: (folderId: string) => void;
  itemCountByFolder: Record<string, number>;
  /** Internal: do not pass directly — the key for the React list. */
  key?: string;
}

function FolderNode({
  folder,
  depth,
  tree,
  activeFolderId,
  onSelect,
  onCreateFolder,
  onDeleteFolder,
  onRenameFolder,
  itemCountByFolder,
}: FolderNodeProps) {
  const { t } = useLanguage();
  const children = tree.get(folder.id) ?? [];
  const [expanded, setExpanded] = useState(depth < 1);
  const Icon = ICONS[folder.icon] ?? FolderIcon;
  const palette = getPalette(folder.color);
  const isActive = activeFolderId === folder.id;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1.5 py-1 hover:bg-surface-high/60 ${
          PADDING_BY_DEPTH[depth] || 'pl-[6px]'
        } ${isActive ? 'bg-brand-primary/10 text-brand-primary' : 'text-on-surface'}`}
      >
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="w-4 h-4 inline-flex items-center justify-center text-on-surface-variant/70 hover:text-on-surface cursor-pointer focus:outline-none"
          aria-label={expanded ? t('folders.collapse') : t('folders.expand')}
        >
          {children.length === 0 ? (
            <span className="w-2 h-2 rounded-full bg-outline-variant/30" />
          ) : expanded ? (
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect(folder.id)}
          data-testid="folder-tree-item"
          data-folder-id={folder.id}
          className="flex-1 flex items-center gap-1.5 text-left text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 rounded"
          title={folder.name}
        >
          <span className={`w-5 h-5 rounded inline-flex items-center justify-center ${palette.inline}`}>
            <Icon className="w-3 h-3" aria-hidden="true" />
          </span>
          <span className="truncate">{folder.name}</span>
        </button>
        <span className="text-[10px] font-mono text-on-surface-variant/70" data-testid="folder-tree-count">
          {itemCountByFolder[folder.id] ?? 0}
        </span>
        <span className="invisible group-hover:visible flex items-center">
          <button
            type="button"
            onClick={() => onCreateFolder(folder.id)}
            className="w-5 h-5 inline-flex items-center justify-center text-on-surface-variant hover:text-brand-primary cursor-pointer focus:outline-none"
            title={t('folders.createSubfolder')}
            aria-label={t('folders.createSubfolder')}
          >
            <Plus className="w-3 h-3" aria-hidden="true" />
          </button>
          {onRenameFolder && (
            <button
              type="button"
              onClick={() => onRenameFolder(folder.id)}
              className="w-5 h-5 inline-flex items-center justify-center text-on-surface-variant hover:text-brand-primary cursor-pointer focus:outline-none text-[10px] font-mono"
              title={t('folders.rename')}
              aria-label={t('folders.rename')}
              data-testid="folder-tree-rename"
            >
              ✎
            </button>
          )}
          {onDeleteFolder && (
            <button
              type="button"
              onClick={() => onDeleteFolder(folder.id)}
              className="w-5 h-5 inline-flex items-center justify-center text-on-surface-variant hover:text-red-300 cursor-pointer focus:outline-none"
              title={t('folders.delete')}
              aria-label={t('folders.delete')}
              data-testid="folder-tree-delete"
            >
              ×
            </button>
          )}
        </span>
      </div>
      {expanded && children.length > 0 && (
        <ul className="space-y-0.5">
          {children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              depth={depth + 1}
              tree={tree}
              activeFolderId={activeFolderId}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onDeleteFolder={onDeleteFolder}
              onRenameFolder={onRenameFolder}
              itemCountByFolder={itemCountByFolder}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

interface FolderRowProps {
  icon: typeof FolderIcon;
  iconClass: string;
  name: string;
  count: number;
  depth: number;
  isActive: boolean;
  onClick: () => void;
  onCreate?: () => void;
}

function FolderRow({ icon: Icon, iconClass, name, count, depth: _depth, isActive, onClick, onCreate }: FolderRowProps) {
  const { t } = useLanguage();
  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-surface-high/60 ${
          isActive ? 'bg-brand-primary/10 text-brand-primary' : 'text-on-surface'
        }`}
      >
        <span className="w-4 h-4" />
        <button
          type="button"
          onClick={onClick}
          data-testid="folder-tree-item"
          data-folder-id={ROOT_FOLDER_ID}
          className="flex-1 flex items-center gap-1.5 text-left text-xs font-semibold cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 rounded"
        >
          <span className={`w-5 h-5 rounded inline-flex items-center justify-center ${iconClass}`}>
            <Icon className="w-3 h-3" aria-hidden="true" />
          </span>
          <span className="truncate">{name}</span>
        </button>
        <span className="text-[10px] font-mono text-on-surface-variant/70">{count}</span>
        {onCreate && (
          <span className="invisible group-hover:visible">
            <button
              type="button"
              onClick={onCreate}
              className="w-5 h-5 inline-flex items-center justify-center text-on-surface-variant hover:text-brand-primary cursor-pointer focus:outline-none"
              title={t('folders.createSubfolder')}
              aria-label={t('folders.createSubfolder')}
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    </li>
  );
}

