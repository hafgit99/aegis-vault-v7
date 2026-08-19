/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TagDefinition, VaultFolder } from '../../types';
import TagPicker from '../TagPicker';

interface VaultFormFolderTagsSectionProps {
  folderId: string;
  onFolderIdChange: (val: string) => void;
  folders: VaultFolder[];
  itemTags: string[];
  onItemTagsChange: (tags: string[]) => void;
  tags: TagDefinition[];
}

export function VaultFormFolderTagsSection({
  folderId,
  onFolderIdChange,
  folders,
  itemTags,
  onItemTagsChange,
  tags,
}: VaultFormFolderTagsSectionProps) {
  const { t } = useLanguage();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-surface-low/40 p-4 rounded-2xl border border-outline-variant/15 text-left animate-fade-in">
      <div>
        <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
          {t('organisation.folders')}
        </label>
        <select
          data-testid="vault-item-folder-select"
          value={folderId}
          onChange={(e) => onFolderIdChange(e.target.value)}
          className="w-full bg-surface-lowest hover:bg-surface-lowest/80 focus:bg-surface-lowest border border-outline-variant/20 rounded-xl px-3 py-2.5 text-sm focus:ring-1 focus:ring-brand-primary/30 focus:outline-none text-on-surface cursor-pointer"
        >
          <option value="">{t('bulk.noFolder', 'No Folder / Klasör Yok')}</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-on-surface-variant/80 uppercase tracking-widest mb-1.5">
          {t('organisation.tags')}
        </label>
        <TagPicker
          selected={itemTags}
          library={tags}
          onChange={onItemTagsChange}
          compact={true}
        />
      </div>
    </div>
  );
}
