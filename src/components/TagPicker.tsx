/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { getPalette, resolveTagColor, slugifyTagName } from '../lib/tags';
import type { TagColorKey, TagDefinition } from '../types';

interface TagPickerProps {
  /** Tags currently attached to the item, by name. */
  selected: string[];
  /** Library entries (used to display the user's chosen colours). */
  library: TagDefinition[];
  onChange: (next: string[]) => void;
  /** When true, the picker is rendered in a dense layout for forms. */
  compact?: boolean;
}

/**
 * Multi-select chip input for vault item tags. Shows the library's
 * colour, falls back to a deterministic hue for unlisted tags, and
 * surfaces an inline "+ tag" affordance to add new entries without
 * leaving the form.
 */
export default function TagPicker({
  selected,
  library,
  onChange,
  compact = false,
}: TagPickerProps) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');

  const libraryBySlug = new Map(library.map((entry) => [entry.slug, entry]));

  const remove = (name: string) => {
    const slug = slugifyTagName(name);
    onChange(selected.filter((tag) => slugifyTagName(tag) !== slug));
  };

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const slug = slugifyTagName(trimmed);
    if (selected.some((tag) => slugifyTagName(tag) === slug)) {
      setDraft('');
      return;
    }
    onChange([...selected, trimmed]);
    setDraft('');
  };

  return (
    <div
      data-testid="tag-picker"
      className={`flex flex-wrap items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}
    >
      {selected.length === 0 && (
        <span className="text-on-surface-variant/60 italic">
          {t('tags.pickerEmpty')}
        </span>
      )}
      {selected.map((name) => {
        const slug = slugifyTagName(name);
        const def = libraryBySlug.get(slug);
        const color: TagColorKey = def?.color ?? resolveTagColor(name, library);
        const palette = getPalette(color);
        return (
          <span
            key={slug}
            data-testid="tag-picker-chip"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-semibold ${palette.pill}`}
          >
            {name}
            <button
              type="button"
              aria-label={t('tags.removeAria', { name })}
              onClick={() => remove(name)}
              className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-white/10 cursor-pointer focus:outline-none"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <div className="inline-flex items-center gap-1">
        <input
          type="text"
          data-testid="tag-picker-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              add();
            }
          }}
          placeholder={t('tags.pickerPlaceholder')}
          className="bg-surface-lowest border border-outline-variant/20 rounded-md px-2 py-1 text-xs font-medium text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
        />
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            add();
          }}
          data-testid="tag-picker-add"
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-md border border-brand-primary/30 bg-brand-primary/10 text-brand-primary px-2 py-1 text-xs font-bold hover:bg-brand-primary/20 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40"
        >
          <Plus className="w-3 h-3" aria-hidden="true" />
          {t('tags.add')}
        </button>
      </div>
    </div>
  );
}
