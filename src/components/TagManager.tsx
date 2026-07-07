/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import {
  getPalette,
  slugifyTagName,
  TAG_COLOR_KEYS,
  TAG_PALETTE,
} from '../lib/tags';
import type { TagColorKey, TagDefinition } from '../types';

interface TagManagerProps {
  open: boolean;
  onClose: () => void;
  library: TagDefinition[];
  tagUsage?: Record<string, number>;
  onCreate: (input: { name: string; color: TagColorKey }) => TagDefinition | null;
  onUpdate: (id: string, patch: { name?: string; color?: TagColorKey }) => void;
  onDelete: (id: string) => void;
}

export default function TagManager({
  open,
  onClose,
  library,
  tagUsage = {},
  onCreate,
  onUpdate,
  onDelete,
}: TagManagerProps) {
  const { t } = useLanguage();
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState<TagColorKey>('indigo');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const sortedLibrary = useMemo(
    () => [...library].sort((a, b) => a.name.localeCompare(b.name)),
    [library],
  );

  if (!open) return null;

  const handleCreate = () => {
    const name = draftName.trim();
    if (!name) return;
    const created = onCreate({ name, color: draftColor });
    if (created) {
      setDraftName('');
      setDraftColor('indigo');
    }
  };

  const beginEdit = (entry: TagDefinition) => {
    setEditingId(entry.id);
    setEditingName(entry.name);
  };

  const commitEdit = (entry: TagDefinition) => {
    const name = editingName.trim();
    if (name && name !== entry.name) {
      onUpdate(entry.id, { name });
    }
    setEditingId(null);
    setEditingName('');
  };

  return (
    <div
      data-testid="tag-manager"
      role="dialog"
      aria-modal="true"
      aria-label={t('tags.managerTitle')}
      className="fixed inset-0 z-[260] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl rounded-2xl border border-outline-variant/20 bg-surface-lowest/97 shadow-2xl shadow-black/50 overflow-hidden">
        <header className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/15">
          <h2 className="text-base font-bold text-on-surface">{t('tags.managerTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="toolbar-button"
            aria-label={t('common.close')}
            title={t('common.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="p-4 space-y-3">
          <div className="rounded-xl border border-outline-variant/15 bg-surface-low p-3 space-y-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
              {t('tags.managerCreate')}
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                data-testid="tag-manager-name"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder={t('tags.managerNamePlaceholder')}
                className="flex-1 bg-surface-lowest border border-outline-variant/20 rounded-md px-2 py-1.5 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
              />
              <select
                data-testid="tag-manager-color"
                value={draftColor}
                onChange={(event) => setDraftColor(event.target.value as TagColorKey)}
                className="bg-surface-lowest border border-outline-variant/20 rounded-md px-2 py-1.5 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
              >
                {TAG_COLOR_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`tags.color.${key}`)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!draftName.trim()}
                data-testid="tag-manager-create"
                className="inline-flex items-center gap-1 rounded-md bg-brand-primary text-white px-3 py-1.5 text-sm font-bold hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('tags.add')}
              </button>
            </div>
            <ColorSwatchRow
              active={draftColor}
              onSelect={(key) => setDraftColor(key)}
            />
          </div>

          <div className="rounded-xl border border-outline-variant/15 bg-surface-low">
            {sortedLibrary.length === 0 ? (
              <p data-testid="tag-manager-empty" className="text-center text-on-surface-variant/70 italic py-6 text-sm">{t('tags.managerEmpty')}</p>
            ) : (
              <ul className="divide-y divide-outline-variant/10">
                {sortedLibrary.map((entry) => {
                  const palette = TAG_PALETTE[entry.color] ?? TAG_PALETTE.slate;
                  const usage = tagUsage[entry.slug] ?? 0;
                  const isEditing = editingId === entry.id;
                  return (
                    <li key={entry.id} data-testid="tag-manager-row" className="flex items-center gap-2 px-3 py-2">
                      <span className={'w-6 h-6 rounded-full border ' + palette.border + ' ' + palette.background} aria-hidden="true" />
                      {isEditing ? (
                        <input type="text" value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onBlur={() => commitEdit(entry)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') commitEdit(entry);
                            if (event.key === 'Escape') { setEditingId(null); setEditingName(''); }
                          }}
                          autoFocus data-testid="tag-manager-edit-input"
                          className="flex-1 bg-surface-lowest border border-outline-variant/20 rounded-md px-2 py-1 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
                        />
                      ) : (
                        <button type="button" onClick={() => beginEdit(entry)}
                          data-testid="tag-manager-name-button"
                          className="flex-1 text-left text-sm text-on-surface hover:text-brand-primary cursor-pointer">{entry.name}</button>
                      )}
                      <select data-testid="tag-manager-row-color" value={entry.color}
                        onChange={(event) => onUpdate(entry.id, { color: event.target.value })}
                        className="bg-surface-lowest border border-outline-variant/20 rounded-md px-1.5 py-1 text-xs text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
                        aria-label={t('tags.colorLabel')}>
                        {TAG_COLOR_KEYS.map((key) => (<option key={key} value={key}>{t('tags.color.' + key)}</option>))}
                      </select>
                      <span className="text-[10px] font-mono text-on-surface-variant/80" title={t('tags.managerUsage', { count: usage })}>{usage}</span>
                      <button type="button" onClick={() => onDelete(entry.id)}
                        data-testid="tag-manager-delete"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-red-300 hover:text-red-200 hover:bg-red-500/10 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-300/40"
                        title={t('tags.deleteAria', { name: entry.name })}
                        aria-label={t('tags.deleteAria', { name: entry.name })}>
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ColorSwatchRowProps {
  active: TagColorKey;
  onSelect: (key: TagColorKey) => void;
}

function ColorSwatchRow({ active, onSelect }: ColorSwatchRowProps) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1" data-testid="tag-manager-swatch-row">
      {TAG_COLOR_KEYS.map((key) => {
        const palette = getPalette(key);
        const isActive = key === active;
        return (
          <button key={key} type="button" onClick={() => onSelect(key)}
            className={'w-6 h-6 rounded-full border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-primary/40 ' + palette.background + ' ' + palette.border + ' ' + (isActive ? 'ring-2 ring-offset-2 ring-offset-surface-low ring-brand-primary scale-110' : 'opacity-70 hover:opacity-100')}
            aria-label={key}
            data-testid={'tag-manager-swatch-' + key} />
        );
      })}
    </div>
  );
}

export { slugifyTagName };

