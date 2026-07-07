import { useEffect, useRef, useState } from 'react';
import { Calendar, Filter, Tag, Wand2, X } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import type { VaultDateRange } from '../hooks/useVaultFilters';
import RecentSearches from './RecentSearches';
import { type RecentSearchEntry } from '../lib/recentSearches';

interface AdvancedSearchPanelProps {
  fuzzyEnabled: boolean;
  onToggleFuzzy: (enabled: boolean) => void;
  selectedTags: string[];
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  dateRange: VaultDateRange;
  dateField: 'createdAt' | 'updatedAt';
  onDateFieldChange: (field: 'createdAt' | 'updatedAt') => void;
  onChangeDateRange: (range: VaultDateRange) => void;
  onClearDateRange: () => void;
  onResetAdvancedFilters: () => void;
  recentSearches: RecentSearchEntry[];
  onSelectRecent: (query: string) => void;
  onRemoveRecent: (query: string) => void;
  onClearRecent: () => void;
  /** Currently active query, used to filter the recent search suggestions. */
  currentQuery: string;
}

/**
 * Floating panel that exposes the advanced search controls. It is
 * rendered as a child of the search bar in `TopBar` and toggled via
 * a button click or keyboard shortcut.
 */
export default function AdvancedSearchPanel({
  fuzzyEnabled,
  onToggleFuzzy,
  selectedTags,
  onToggleTag,
  onClearTags,
  dateRange,
  dateField,
  onDateFieldChange,
  onChangeDateRange,
  onClearDateRange,
  onResetAdvancedFilters,
  recentSearches,
  onSelectRecent,
  onRemoveRecent,
  onClearRecent,
  currentQuery,
}: AdvancedSearchPanelProps) {
  const { t } = useLanguage();
  const [tagDraft, setTagDraft] = useState('');
  const [fromDate, setFromDate] = useState(dateRange.from ?? '');
  const [toDate, setToDate] = useState(dateRange.to ?? '');
  const [fromError, setFromError] = useState<string | null>(null);
  const [toError, setToError] = useState<string | null>(null);
  const isFirstRender = useRef(true);

  // Keep the local input state in sync with the parent when the parent
  // is reset (e.g. clicking "Clear filters").
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setFromDate(dateRange.from ?? '');
    setToDate(dateRange.to ?? '');
  }, [dateRange.from, dateRange.to]);

  const commitDateRange = (nextFrom: string, nextTo: string) => {
    if (nextFrom && nextTo && nextFrom > nextTo) {
      setFromError(t('top.search.dateRangeInvalid'));
      return;
    }
    setFromError(null);
    setToError(null);
    onChangeDateRange({ from: nextFrom || null, to: nextTo || null });
  };

  const handleAddTag = () => {
    const tag = tagDraft.trim();
    if (!tag) return;
    onToggleTag(tag);
    setTagDraft('');
  };

  const activeFilterCount =
    selectedTags.length +
    (dateRange.from ? 1 : 0) +
    (dateRange.to ? 1 : 0) +
    (fuzzyEnabled ? 0 : 1); // the toggle is on by default; an off state counts

  return (
    <div
      data-testid="advanced-search-panel"
      className="absolute top-full left-0 right-0 mt-2 z-40 rounded-xl border border-outline-variant/20 bg-surface-lowest/97 backdrop-blur shadow-2xl shadow-black/40 p-3 sm:p-4 space-y-3 animate-fade-in"
      role="region"
      aria-label={t('top.search.advanced')}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2 text-on-surface">
          <span className="w-7 h-7 rounded-lg bg-brand-primary/10 border border-brand-primary/15 flex items-center justify-center text-brand-primary">
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
          </span>
          <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider">
            {t('top.search.advanced')}
          </h3>
          {activeFilterCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-brand-primary/15 text-brand-primary">
              {activeFilterCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onResetAdvancedFilters}
            className="text-[11px] font-semibold text-on-surface-variant hover:text-on-surface px-2 py-1 rounded-md border border-outline-variant/15 hover:border-outline-variant/30 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            data-testid="advanced-search-reset"
          >
            {t('top.search.reset')}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Fuzzy toggle */}
        <section className="rounded-lg border border-outline-variant/15 bg-surface-low p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Wand2 className="w-4 h-4 text-brand-primary shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-on-surface truncate">
                  {t('top.search.fuzzyTitle')}
                </p>
                <p className="text-[10px] text-on-surface-variant/80 leading-tight">
                  {t('top.search.fuzzyDescription')}
                </p>
              </div>
            </div>
            <label className="inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={fuzzyEnabled}
                onChange={(event) => onToggleFuzzy(event.target.checked)}
                data-testid="advanced-search-fuzzy-toggle"
              />
              <span className="w-9 h-5 rounded-full bg-outline-variant/40 peer-checked:bg-brand-primary/70 relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-4" />
            </label>
          </div>
        </section>

        {/* Date range */}
        <section className="rounded-lg border border-outline-variant/15 bg-surface-low p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="w-4 h-4 text-brand-primary shrink-0" aria-hidden="true" />
              <p className="text-xs font-bold text-on-surface truncate">
                {t('top.search.dateRange')}
              </p>
            </div>
            <select
              value={dateField}
              onChange={(event) =>
                onDateFieldChange(event.target.value as 'createdAt' | 'updatedAt')
              }
              className="text-[10px] font-semibold bg-surface-lowest border border-outline-variant/20 rounded px-1.5 py-1 text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
              data-testid="advanced-search-date-field"
              aria-label={t('top.search.dateFieldLabel')}
            >
              <option value="updatedAt">{t('top.search.dateFieldUpdated')}</option>
              <option value="createdAt">{t('top.search.dateFieldCreated')}</option>
            </select>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label className="flex-1 flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-on-surface-variant/80">
              {t('top.search.dateFrom')}
              <input
                type="date"
                value={fromDate}
                onChange={(event) => {
                  setFromDate(event.target.value);
                  commitDateRange(event.target.value, toDate);
                }}
                className="text-xs font-semibold text-on-surface bg-surface-lowest border border-outline-variant/20 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
                data-testid="advanced-search-date-from"
                aria-invalid={Boolean(fromError)}
              />
            </label>
            <label className="flex-1 flex flex-col gap-0.5 text-[10px] uppercase tracking-wider text-on-surface-variant/80">
              {t('top.search.dateTo')}
              <input
                type="date"
                value={toDate}
                onChange={(event) => {
                  setToDate(event.target.value);
                  commitDateRange(fromDate, event.target.value);
                }}
                className="text-xs font-semibold text-on-surface bg-surface-lowest border border-outline-variant/20 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
                data-testid="advanced-search-date-to"
                aria-invalid={Boolean(toError)}
              />
            </label>
          </div>
          {(fromError || toError) && (
            <p
              role="alert"
              data-testid="advanced-search-date-error"
              className="text-[10px] text-red-300 font-medium"
            >
              {fromError || toError}
            </p>
          )}
          {(dateRange.from || dateRange.to) && (
            <button
              type="button"
              onClick={() => {
                setFromDate('');
                setToDate('');
                setFromError(null);
                setToError(null);
                onClearDateRange();
              }}
              className="text-[10px] font-semibold text-on-surface-variant hover:text-red-300 cursor-pointer focus:outline-none"
              data-testid="advanced-search-date-clear"
            >
              {t('top.search.clearDateRange')}
            </button>
          )}
        </section>
      </div>

      {/* Tags */}
      <section className="rounded-lg border border-outline-variant/15 bg-surface-low p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Tag className="w-4 h-4 text-brand-primary shrink-0" aria-hidden="true" />
            <p className="text-xs font-bold text-on-surface truncate">
              {t('top.search.tagsTitle')}
            </p>
          </div>
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={onClearTags}
              className="text-[10px] font-semibold text-on-surface-variant hover:text-red-300 cursor-pointer focus:outline-none"
              data-testid="advanced-search-tags-clear"
            >
              {t('top.search.clearTags')}
            </button>
          )}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleAddTag();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={tagDraft}
            onChange={(event) => setTagDraft(event.target.value)}
            placeholder={t('top.search.tagsPlaceholder')}
            className="flex-1 text-xs font-medium text-on-surface bg-surface-lowest border border-outline-variant/20 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-primary/30"
            data-testid="advanced-search-tag-input"
            aria-label={t('top.search.tagsPlaceholder')}
          />
          <button
            type="submit"
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-md bg-brand-primary/15 text-brand-primary hover:bg-brand-primary/25 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/30 disabled:opacity-50"
            disabled={!tagDraft.trim()}
            data-testid="advanced-search-tag-add"
          >
            {t('top.search.tagsAdd')}
          </button>
        </form>
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" data-testid="advanced-search-tags-list">
            {selectedTags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full bg-brand-primary/15 text-brand-primary border border-brand-primary/20 px-2.5 py-0.5 text-[11px] font-semibold"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => onToggleTag(tag)}
                  aria-label={`${t('top.search.removeTag')} ${tag}`}
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full hover:bg-brand-primary/25 cursor-pointer focus:outline-none"
                  data-testid="advanced-search-tag-remove"
                >
                  <X className="w-3 h-3" aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Recent searches */}
      <section className="rounded-lg border border-outline-variant/15 bg-surface-low p-2.5">
        <RecentSearches
          entries={recentSearches}
          onSelect={onSelectRecent}
          onRemove={onRemoveRecent}
          onClear={onClearRecent}
        />
        {currentQuery && (
          <p className="text-[10px] text-on-surface-variant/70 mt-2">
            {`${t('top.search.recentActiveQueryPrefix')}${currentQuery}${t('top.search.recentActiveQuerySuffix')}`}
          </p>
        )}
      </section>
    </div>
  );
}

