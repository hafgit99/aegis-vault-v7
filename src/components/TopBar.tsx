import { useState, useRef, useEffect, useCallback, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';

import { Bell, Lock, Menu, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { avatarClassNameForValue } from '../lib/avatarStyles';
import { APP_PROFILE_ALT } from '../lib/branding';
import { ActiveTab } from '../types';
import AdvancedSearchPanel from './AdvancedSearchPanel';
import LocalStorageBadge from './LocalStorageBadge';
import { isGradient } from './ProfileModal';
import type { VaultDateRange } from '../hooks/useVaultFilters';
import type { RecentSearchEntry } from '../lib/recentSearches';

interface TopBarProps {
  activeTab: ActiveTab;
  searchQuery: string;
  profileName: string;
  profileAvatar: string;
  onSearchChange: (value: string) => void;
  onOpenSidebar: () => void;
  onRefresh: () => void | Promise<void>;
  onOpenVaultStatus: () => void;
  onOpenProfile: () => void;
  onLock: () => void;
  // ── Advanced search additions ──────────────────────────────────
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
  onRemoveRecentEntry: (query: string) => void;
  onClearRecentSearches: () => void;
  /** Commit a query to the recent-search history (called on Enter / submit). */
  onCommitSearch: (query: string) => void;
}

export default function TopBar({
  activeTab,
  searchQuery,
  profileName,
  profileAvatar,
  onSearchChange,
  onOpenSidebar,
  onRefresh,
  onOpenVaultStatus,
  onOpenProfile,
  onLock,
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
  onRemoveRecentEntry,
  onClearRecentSearches,
  onCommitSearch,
}: TopBarProps) {
  const { t } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const advancedRef = useRef<HTMLDivElement>(null);
  const advancedButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleFocusSearch = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('aegis-focus-search', handleFocusSearch);
    return () => window.removeEventListener('aegis-focus-search', handleFocusSearch);
  }, []);

  // Close the advanced panel when clicking outside or pressing Escape.
  useEffect(() => {
    if (!isAdvancedOpen) return;
    const handleClickOutside = (event: ReactMouseEvent) => {
      const target = event.target as Node;
      if (
        advancedRef.current?.contains(target) ||
        advancedButtonRef.current?.contains(target)
      ) {
        return;
      }
      setIsAdvancedOpen(false);
    };
    const handleKey = (event: ReactKeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAdvancedOpen(false);
        advancedButtonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isAdvancedOpen]);

  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSearchKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        onCommitSearch(searchQuery);
      } else if (event.key === 'ArrowDown' && recentSearches.length > 0) {
        // Cycle into the advanced panel — keeps focus where the user expects.
        event.preventDefault();
        setIsAdvancedOpen(true);
      }
    },
    [onCommitSearch, searchQuery, recentSearches.length],
  );

  const handleSelectRecent = useCallback(
    (query: string) => {
      onSearchChange(query);
      onCommitSearch(query);
      inputRef.current?.focus();
    },
    [onCommitSearch, onSearchChange],
  );

  const hasActiveAdvancedFilters =
    selectedTags.length > 0 ||
    Boolean(dateRange.from) ||
    Boolean(dateRange.to) ||
    !fuzzyEnabled;

  return (
    <header className="min-h-[60px] shrink-0 border-b border-outline-variant/15 bg-surface-lowest/85 flex justify-between items-center px-3 sm:px-4 lg:px-6 py-2 z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 lg:flex-none lg:w-1/3">
        <button
          data-testid="topbar-menu-button"
          onClick={onOpenSidebar}
          className="lg:!hidden toolbar-button cursor-pointer shrink-0"
          title={t('top.openMenu')}
        >
          <Menu className="w-5 h-5" />
        </button>
        {activeTab === 'vault' && (
          <div className="relative w-full max-w-md min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] w-4 h-4" />
            <input
              ref={inputRef}
              data-testid="vault-search-input"
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full bg-surface-low border border-outline-variant/15 rounded-lg pl-9 pr-12 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/25 text-on-surface placeholder-on-surface-variant/50 focus:outline-none transition-all"
              placeholder={t('top.searchPlaceholder')}
              aria-label={t('top.searchPlaceholder')}
            />
            <button
              ref={advancedButtonRef}
              type="button"
              onClick={() => setIsAdvancedOpen((open) => !open)}
              data-testid="topbar-advanced-search-toggle"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-7 h-7 rounded-md border cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 transition-all ${
                isAdvancedOpen || hasActiveAdvancedFilters
                  ? 'bg-brand-primary/15 border-brand-primary/30 text-brand-primary'
                  : 'bg-surface-lowest border-outline-variant/15 text-on-surface-variant hover:text-brand-primary hover:border-brand-primary/30'
              }`}
              title={t('top.search.advancedToggle')}
              aria-label={t('top.search.advancedToggle')}
              aria-expanded={isAdvancedOpen}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {hasActiveAdvancedFilters && (
                <span
                  className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brand-primary"
                  data-testid="advanced-search-active-dot"
                />
              )}
            </button>
            {isAdvancedOpen && (
              <div ref={advancedRef}>
                <AdvancedSearchPanel
                  fuzzyEnabled={fuzzyEnabled}
                  onToggleFuzzy={onToggleFuzzy}
                  selectedTags={selectedTags}
                  onToggleTag={onToggleTag}
                  onClearTags={onClearTags}
                  dateRange={dateRange}
                  dateField={dateField}
                  onDateFieldChange={onDateFieldChange}
                  onChangeDateRange={onChangeDateRange}
                  onClearDateRange={onClearDateRange}
                  onResetAdvancedFilters={onResetAdvancedFilters}
                  recentSearches={recentSearches}
                  onSelectRecent={handleSelectRecent}
                  onRemoveRecent={onRemoveRecentEntry}
                  onClearRecent={onClearRecentSearches}
                  currentQuery={searchQuery}
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 lg:gap-4 shrink-0 pl-2">
        <div className="hidden sm:block">
          <LocalStorageBadge />
        </div>

        <div className="flex items-center gap-2 text-on-surface-variant">
          <button
            data-testid="topbar-refresh-button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="toolbar-button focus:outline-none cursor-pointer disabled:cursor-wait disabled:opacity-70"
            title={t('top.refresh')}
          >
            <RefreshCw className={`w-4.5 h-4.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            data-testid="topbar-status-button"
            onClick={onOpenVaultStatus}
            className="toolbar-button focus:outline-none relative cursor-pointer"
            title={t('top.notifications')}
          >
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-error rounded-full"></span>
          </button>
          <button
            data-testid="topbar-lock-button"
            onClick={onLock}
            className="toolbar-button focus:outline-none cursor-pointer text-red-300 hover:text-red-200 hover:bg-red-500/10"
            title={t('nav.lockVault')}
            aria-label={t('nav.lockVault')}
          >
            <Lock className="w-4.5 h-4.5" />
          </button>

          <button
            data-testid="topbar-profile-button"
            onClick={onOpenProfile}
            className="w-9 h-9 rounded-lg overflow-hidden border border-outline-variant/20 cursor-pointer hover:border-brand-primary/40 active:scale-95 transition-all text-left focus:outline-none focus:ring-1 focus:ring-brand-primary/40 flex items-center justify-center shrink-0"
            title={`${profileName} - ${t('top.editProfile')}`}
          >
            {isGradient(profileAvatar) ? (
              <div
                className={`w-full h-full text-white text-[11px] font-bold font-display flex items-center justify-center select-none ${avatarClassNameForValue(profileAvatar)}`}
              >
                {profileName.charAt(0).toUpperCase()}
              </div>
            ) : (
              <img
                alt={APP_PROFILE_ALT}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                src={profileAvatar}
              />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
