import { History, Search, Trash2, X } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { type RecentSearchEntry } from '../lib/recentSearches';

interface RecentSearchesProps {
  entries: RecentSearchEntry[];
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}

/**
 * Compact horizontal list of recent search chips. Each chip shows the
 * query, an X to remove just that entry, and a trash icon to clear the
 * whole history. The component is presentational — state lives in the
 * `useVaultFilters` hook.
 */
export default function RecentSearches({
  entries,
  onSelect,
  onRemove,
  onClear,
}: RecentSearchesProps) {
  const { t } = useLanguage();

  if (!entries.length) {
    return (
      <div
        data-testid="recent-searches-empty"
        className="flex items-center gap-2 text-[11px] text-on-surface-variant/70 px-1"
      >
        <History className="w-3.5 h-3.5" aria-hidden="true" />
        <span>{t('top.search.recentEmpty')}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="recent-searches"
      role="group"
      aria-label={t('top.search.recentTitle')}
      className="flex flex-col gap-1.5"
    >
      <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-on-surface-variant/70 font-semibold px-1">
        <span className="inline-flex items-center gap-1.5">
          <History className="w-3 h-3" aria-hidden="true" />
          {t('top.search.recentTitle')}
        </span>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 text-red-300 hover:text-red-200 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-300/40 rounded px-1"
          aria-label={t('top.search.clearHistory')}
          title={t('top.search.clearHistory')}
        >
          <Trash2 className="w-3 h-3" aria-hidden="true" />
          {t('top.search.clear')}
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {entries.map((entry) => (
          <span
            key={`${entry.query}-${entry.lastUsedAt}`}
            data-testid="recent-search-chip"
            className="group inline-flex items-center gap-1 rounded-full border border-outline-variant/25 bg-surface-low px-2.5 py-1 text-[11px] font-medium text-on-surface hover:border-brand-primary/40 hover:bg-brand-primary/5 transition-all"
          >
            <button
              type="button"
              onClick={() => onSelect(entry.query)}
              className="inline-flex items-center gap-1 cursor-pointer focus:outline-none"
              title={entry.query}
            >
              <Search className="w-3 h-3 text-on-surface-variant" aria-hidden="true" />
              <span className="max-w-[160px] truncate">{entry.query}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(entry.query)}
              aria-label={`${t('top.search.remove')} ${entry.query}`}
              title={t('top.search.remove')}
              className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-on-surface-variant hover:text-red-300 hover:bg-red-500/10 cursor-pointer focus:outline-none focus:ring-1 focus:ring-red-300/40"
            >
              <X className="w-3 h-3" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
