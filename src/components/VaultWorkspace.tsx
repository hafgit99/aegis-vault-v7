import React, { useCallback, useState, useEffect, useRef, useReducer, memo } from 'react';
import { AlignJustify, ArrowLeft, CreditCard, FileText, Fingerprint, Heart, KeyRound, Layers, LayoutDashboard, Lock, Plus, Rows, Search, Smartphone, User, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import type { VaultCategoryFilter } from '../hooks/useVaultFilters';
import type { FilteredVaultItem } from '../hooks/useVaultQueries';
import {
  createInitialPaginationState,
  createVaultPaginationReducer,
} from '../hooks/useVaultPagination';

import { useLanguage } from '../i18n/LanguageContext';
import { androidAutofillTargetLabel, type AndroidAutofillRequest } from '../lib/androidAutofill';
import { isAndroidAutofillTargetMatch, sortAndroidAutofillMatches } from '../lib/androidAutofillMatching';
import type { AuditReport, TagDefinition, VaultFolder, VaultItem } from '../types';
import { useBulkSelection } from '../hooks/useOrganisation';
import type { BulkActionDescriptor } from './BulkActionBar';
import AegisGuardReport from './AegisGuardReport';
import CryptoShieldPanel from './CryptoShieldPanel';
import DashboardCategoryStats from './DashboardCategoryStats';
import DashboardHeader from './DashboardHeader';
import DashboardQuickActions from './DashboardQuickActions';
import DashboardSecurityScoreCard from './DashboardSecurityScoreCard';
import RecentVaultPanel from './RecentVaultPanel';
import VaultItemDetailPanel from './VaultItemDetailPanel';
import type { ViewDensity } from './VaultListItem';
import VaultListItem from './VaultListItem';
import { StickyNoteCard } from './notes/StickyNoteCard';
import BulkActionBar from './BulkActionBar';
import BulkSelectWrapper from './BulkSelectWrapper';

interface VaultWorkspaceProps {
  selectedItem: VaultItem | null;
  mobileActiveView: 'list' | 'detail';
  filteredItems: VaultItem[];
  /** Items enriched with fuzzy match metadata, used for highlighting. */
  filteredItemResults: FilteredVaultItem[];
  activeItems: VaultItem[];
  filterFavoritesOnly: boolean;
  favoriteCount: number;
  loginCount: number;
  cardCount: number;
  secureNoteCount: number;
  passkeyCount: number;
  identityCount: number;
  selectedCategory: VaultCategoryFilter;
  auditReport: AuditReport;
  profileName: string;
  copiedField: string | null;
  score: number;
  isPasswordRevealed: boolean;
  isCardNumberRevealed: boolean;
  isCvvRevealed: boolean;
  isPinRevealed: boolean;
  isPasskeyPrivateExponentRevealed: boolean;
  totpCountdown: number;
  onNewItem: () => void;
  onOpenProfile: () => void;
  onLock: () => void;
  onOpenAudit: () => void;
  onOpenGenerator: () => void;
  onSetFavoritesOnly: (value: boolean) => void;
  onSelectCategory: (category: VaultCategoryFilter) => void;
  onSelectDashboard: () => void;
  onBackToList: () => void;
  onSelectItem: (item: VaultItem) => void;
  onSelectAuditItem?: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void | Promise<void>;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggleReveal: (field: 'password' | 'cardNumber' | 'cardCvv' | 'cardPin' | 'passkeyPrivateExponent') => void;
  onCopyText: (text: string, field: string) => void;
  onDownloadAttachment: (id: string, name: string) => void;
  isAutofillMode?: boolean;
  autofillRequest?: AndroidAutofillRequest | null;
  onCancelAutofill?: () => void;
  onApproveAutofill?: (item: VaultItem) => void;
  onUpdateItemCategory?: (itemId: string, category: VaultItem['category']) => void;
  onSecureShare?: (item: VaultItem) => void;
  // 5.3 Tags & Organisation
  folders?: VaultFolder[];
  tags?: TagDefinition[];
  onApplyBulkAction?: (action: BulkActionDescriptor) => void;
  onOpenFolderSidebar?: () => void;
}

export function VaultWorkspaceContent({
  selectedItem,
  mobileActiveView,
  filteredItems,
  filteredItemResults,
  activeItems,
  filterFavoritesOnly,
  favoriteCount,
  loginCount,
  cardCount,
  secureNoteCount,
  passkeyCount,
  identityCount,
  selectedCategory,
  auditReport,
  profileName,
  copiedField,
  score,
  isPasswordRevealed,
  isCardNumberRevealed,
  isCvvRevealed,
  isPinRevealed,
  isPasskeyPrivateExponentRevealed,
  totpCountdown,
  onNewItem,
  onOpenProfile,
  onLock,
  onOpenAudit,
  onOpenGenerator,
  onSetFavoritesOnly,
  onSelectCategory,
  onSelectDashboard,
  onBackToList,
  onSelectItem,
  onToggleFavorite,
  onEdit,
  onDelete,
  onToggleReveal,
  onCopyText,
  onDownloadAttachment,
  isAutofillMode = false,
  autofillRequest = null,
  onCancelAutofill,
  onApproveAutofill,
  onUpdateItemCategory,
  folders = [],
  tags = [],
  onApplyBulkAction = () => {},
  onSecureShare = () => {},
  onOpenFolderSidebar = () => {},
}: VaultWorkspaceProps) {
  // M10 Dilim 3: selection state is owned here — UnlockedApp no longer
  // re-renders (and defeats this memo) on every selection toggle.
  const bulkSelection = useBulkSelection();
  const { t } = useLanguage();
  const autofillTargetLabel = androidAutofillTargetLabel(autofillRequest);

  const [paginationState, dispatchPagination] = useReducer(
    createVaultPaginationReducer(),
    filteredItems.length,
    (totalCount) => createInitialPaginationState(totalCount),
  );
  const visibleCount = paginationState.visibleCount;
  const resetVisibleCount = useCallback(() => {
    dispatchPagination({ type: 'reset', totalCount: filteredItems.length });
  }, [filteredItems.length]);
  const [dragOverCategory, setDragOverCategory] = useState<VaultCategoryFilter | null>(null);
  const [density, setDensity] = useState<ViewDensity>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('aegis_vault_view_density') as ViewDensity) || 'comfortable';
    }
    return 'comfortable';
  });

  const toggleDensity = useCallback(() => {
    setDensity((prev) => {
      const next: ViewDensity = prev === 'comfortable' ? 'compact' : 'comfortable';
      if (typeof window !== 'undefined') {
        localStorage.setItem('aegis_vault_view_density', next);
      }
      return next;
    });
  }, []);

  // Sentinel ref. The sentinel is the last <button> inside the scrollable
  // container; an IntersectionObserver attached to it is the only thing
  // that ever calls loadMore. We deliberately do not listen for scroll
  // events: on Android WebView the combination of framer-motion's layout
  // animations on the row mount/unmount and the synchronous scrollHeight
  // growth causes the scrollTop to bounce inside the bottom threshold,
  // which used to fire `loadMore` 3-4 times per frame and produced a
  // self-feeding scroll loop (the user saw the list scrubbing on its own).
  const sentinelRef = useRef<HTMLButtonElement | null>(null);

  // Reset visibleCount if the filtered set changes.
  useEffect(() => {
    resetVisibleCount();
  }, [resetVisibleCount]);

  const loadMore = useCallback(() => {
    dispatchPagination({ type: 'loadMore', totalCount: filteredItems.length });
  }, [filteredItems.length]);

  // Release the loading guard after a paint so the next batch can be
  // scheduled once the new items are committed to the DOM. The reducer
  // tracks the guard internally; we only need to tell it when to release.
  useEffect(() => {
    if (!paginationState.loadingMore) return;
    const id = (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function')
      ? window.requestAnimationFrame(() => {
          dispatchPagination({ type: 'release' });
        })
      : (setTimeout(() => dispatchPagination({ type: 'release' }), 0) as unknown as number);
    return () => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(id);
      } else {
        clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
      }
    };
  }, [paginationState.loadingMore]);

  // Single source of truth for "are we close to the bottom": an
  // IntersectionObserver attached to the sentinel button. It is unaffected
  // by scrollHeight jitter from layout animations and never fires more
  // often than once per IO callback batch.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadMore();
          }
        }
      },
      { rootMargin: '300px 0px 300px 0px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, visibleCount]);

  const autofillMatchCount = isAutofillMode
    ? filteredItems.filter((item) => isAndroidAutofillTargetMatch(item, autofillRequest)).length
    : 0;
  const orderedItems = isAutofillMode ? sortAndroidAutofillMatches(filteredItems, autofillRequest) : filteredItems;
  const displayedItems = orderedItems.slice(0, visibleCount);
  // Build a quick lookup so the renderer can fetch the match metadata for a given item.
  const matchByItemId = new Map(filteredItemResults.map((entry) => [entry.item.id, entry.match]));

  return (
    <>
      <section
        className={`w-full min-w-0 max-w-full lg:max-w-[480px] xl:max-w-[540px] lg:w-[480px] xl:w-[540px] border-r border-outline-variant/15 flex flex-col bg-surface-lowest/55 h-full overflow-hidden shrink-0 ${
          mobileActiveView === 'detail' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <BulkActionBar
          selectedIds={bulkSelection.selectedIds}
          selectedItems={activeItems.filter(item => bulkSelection.selectedIds.has(item.id))}
          folders={folders}
          library={tags}
          onClear={bulkSelection.clear}
          onApply={onApplyBulkAction}
        />
        <div className="p-5 pb-2 space-y-3 shrink-0">
          <h2 className="font-display text-lg font-bold text-on-surface flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenFolderSidebar}
                className="lg:hidden toolbar-button cursor-pointer text-brand-primary flex items-center justify-center p-1.5"
                title={t('organisation.title', 'Folders')}
              >
                <Layers className="w-4.5 h-4.5" />
              </button>
              <span>{t('vaultList.title')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                data-testid="vault-density-toggle-button"
                type="button"
                onClick={toggleDensity}
                className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                  density === 'compact'
                    ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/30'
                    : 'text-on-surface-variant/70 border-outline-variant/15 hover:text-on-surface hover:bg-surface-low'
                }`}
                title={density === 'comfortable' ? t('vaultList.viewMode.compact') : t('vaultList.viewMode.comfortable')}
                aria-label={density === 'comfortable' ? t('vaultList.viewMode.compact') : t('vaultList.viewMode.comfortable')}
              >
                {density === 'compact' ? <AlignJustify className="w-4 h-4" /> : <Rows className="w-4 h-4" />}
              </button>
              <button
                data-testid="new-vault-item-button"
                onClick={onNewItem}
                className="toolbar-button cursor-pointer"
                title={t('vaultList.newItem')}
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </h2>

          <div className="flex bg-surface-low p-1 rounded-lg border border-outline-variant/15 text-xs">
            <button
              data-testid="vault-filter-all"
              onClick={() => {
                onSetFavoritesOnly(false);
                resetVisibleCount();
              }}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all text-center cursor-pointer ${
                !filterFavoritesOnly
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t('vaultList.all')} ({activeItems.length})
            </button>
            <button
              data-testid="vault-filter-favorites"
              onClick={() => {
                onSetFavoritesOnly(true);
                resetVisibleCount();
              }}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                filterFavoritesOnly
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
              <span>{t('vaultList.favorites')} ({favoriteCount})</span>
            </button>
          </div>

          {/* Category Filter Chips */}
          <div className="flex flex-wrap gap-1.5 pb-0.5 -mx-1 px-1">
            {([
              { key: 'all' as VaultCategoryFilter, icon: <Layers className="w-3 h-3" />, label: t('detail.category.all', 'Tümü'), count: activeItems.length },
              { key: 'login' as VaultCategoryFilter, icon: <KeyRound className="w-3 h-3" />, label: t('detail.category.login'), count: loginCount },
              { key: 'card' as VaultCategoryFilter, icon: <CreditCard className="w-3 h-3" />, label: t('detail.category.card'), count: cardCount },
              { key: 'passkey' as VaultCategoryFilter, icon: <Fingerprint className="w-3 h-3" />, label: t('detail.category.passkey'), count: passkeyCount },
              { key: 'identity' as VaultCategoryFilter, icon: <User className="w-3 h-3" />, label: t('detail.category.identity'), count: identityCount },
              { key: 'secure_note' as VaultCategoryFilter, icon: <FileText className="w-3 h-3" />, label: t('detail.category.secureNote'), count: secureNoteCount },
            ]).map((cat) => {
              const isDragOver = dragOverCategory === cat.key;
              const isDropAllowed = cat.key !== 'all';

              return (
                <button
                  key={cat.key}
                  type="button"
                  data-testid={`category-chip-${cat.key}`}
                  onClick={() => {
                    onSelectCategory(cat.key);
                    resetVisibleCount();
                  }}
                  onDragOver={(e) => {
                    if (isDropAllowed) {
                      e.preventDefault();
                    }
                  }}
                  onDragEnter={(_e) => {
                    if (isDropAllowed) {
                      setDragOverCategory(cat.key);
                    }
                  }}
                  onDragLeave={() => {
                    if (isDropAllowed) {
                      setDragOverCategory(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (isDropAllowed) {
                      e.preventDefault();
                      setDragOverCategory(null);
                      const itemId = e.dataTransfer.getData('text/plain');
                      if (itemId && onUpdateItemCategory) {
                        onUpdateItemCategory(itemId, cat.key as VaultItem['category']);
                      }
                    }
                  }}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                    selectedCategory === cat.key
                      ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/25'
                      : isDragOver
                        ? 'bg-brand-primary/20 text-brand-primary border-brand-primary ring-2 ring-brand-primary/40'
                        : 'bg-transparent text-on-surface-variant/70 border-outline-variant/10 hover:text-on-surface hover:bg-surface-low/60'
                  }`}
                >
                  {cat.icon}
                  <span>{cat.label}</span>
                  <span className={`ml-0.5 font-mono text-[9px] ${
                    selectedCategory === cat.key ? 'text-brand-primary/70' : 'text-on-surface-variant/40'
                  }`}>{cat.count}</span>
                </button>
              );
            })}
          </div>

          <div className="flex justify-between items-center text-on-surface-variant text-xs mt-1">
            <p>
              {filteredItems.length} {t('vaultList.itemsListed')}
            </p>
            {filteredItems.length > visibleCount && (
              <p className="text-[10px] opacity-75 font-mono">
                {t('common.showing', 'Gösterilen') || 'Showing'} {visibleCount}/{filteredItems.length}
              </p>
            )}
          </div>

          {isAutofillMode && (
            <div
              data-testid="vault-autofill-mode-banner"
              className="flex items-start gap-2.5 rounded-lg border border-brand-primary/20 bg-brand-primary/10 px-3 py-2.5 text-left shadow-sm"
            >
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-primary/20 bg-brand-primary/10 text-brand-primary">
                <Smartphone className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-brand-primary">
                  {t('autofill.vault.title')}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">
                  {t('autofill.vault.description')}
                </p>
                {autofillTargetLabel && (
                  <p className="mt-1.5 inline-flex max-w-full items-center rounded-md border border-brand-primary/15 bg-[#080a09]/35 px-2 py-1 font-mono text-[10px] text-on-surface truncate">
                    {t('autofill.target.label')}: {autofillTargetLabel}
                  </p>
                )}
                {autofillMatchCount > 0 && (
                  <p className="mt-1 text-[10px] font-semibold text-brand-primary">
                    {autofillMatchCount} {t('autofill.matchesFound')}
                  </p>
                )}
              </div>
              {onCancelAutofill && (
                <button
                  type="button"
                  data-testid="vault-autofill-cancel-button"
                  onClick={onCancelAutofill}
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-outline-variant/15 bg-surface-low text-on-surface-variant hover:border-red-400/25 hover:bg-red-500/10 hover:text-red-200 focus:outline-none focus:ring-1 focus:ring-red-300/40 active:scale-95 transition-all cursor-pointer"
                  title={t('autofill.vault.cancel')}
                  aria-label={t('autofill.vault.cancel')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-3 pb-2 shrink-0">
          <button
            type="button"
            data-testid="vault-dashboard-card"
            onClick={onSelectDashboard}
            className={`group w-full p-3 rounded-lg border flex items-center gap-3 text-left cursor-pointer transition-all focus:outline-none focus:ring-1 focus:ring-brand-primary/40 ${
              selectedItem === null
                ? 'border-brand-primary/20 bg-brand-primary/10'
                : 'border-outline-variant/10 hover:border-brand-primary/10 hover:bg-surface-low/70'
            }`}
          >
            <div className="icon-tile bg-brand-primary/10 text-brand-primary shrink-0 select-none">
              <LayoutDashboard className="w-4.5 h-4.5 text-brand-primary group-hover:rotate-6 transition-transform" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-xs text-brand-primary tracking-wider uppercase flex items-center gap-1.5">
                <span>{t('vaultList.dashboardTitle')}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </h3>
              <p className="text-[10px] text-on-surface-variant font-mono truncate">{t('vaultList.dashboardDescription')}</p>
            </div>
          </button>
        </div>

        <div
          className="flex-1 overflow-y-auto overflow-x-hidden p-3 pt-0 space-y-1.5 scrollbar-hide min-w-0 max-w-full"
        >
          {displayedItems.length === 0 ? (
            <div
              data-testid="vault-empty-state"
              className="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in"
            >
              <div className="w-12 h-12 rounded-xl bg-surface-low border border-outline-variant/15 flex items-center justify-center text-on-surface-variant/40 mb-4 shadow-inner">
                <Search className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-on-surface-variant/60 max-w-[240px] leading-relaxed italic">
                {t('vaultList.empty')}
              </p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {displayedItems.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.12 }}
                  className="w-full min-w-0 max-w-full overflow-hidden"
                >
                  <BulkSelectWrapper
                    id={item.id}
                    isSelectionMode={bulkSelection.isSelectionMode}
                    isSelected={bulkSelection.isSelected(item.id)}
                    onToggle={bulkSelection.toggle}
                    onSelectOnly={bulkSelection.selectOnly}
                    onShiftSelect={(id) => {
                      const allIds = displayedItems.map((i) => i.id);
                      const activeItem = allIds.find(aid => bulkSelection.selectedIds.has(aid));
                      if (activeItem) {
                        bulkSelection.selectRange(allIds, activeItem, id);
                      } else {
                        bulkSelection.toggle(id);
                      }
                    }}
                  >
                    {selectedCategory === 'secure_note' && density === 'comfortable' ? (
                      <StickyNoteCard
                        item={item}
                        isSelected={selectedItem?.id === item.id}
                        onSelect={onSelectItem}
                        onCopyNote={(text) => onCopyText(text, 'secure_notes_copy')}
                      />
                    ) : (
                      <VaultListItem
                        item={item}
                        isSelected={selectedItem?.id === item.id}
                        onSelect={onSelectItem}
                        autofillRecommended={isAutofillMode && isAndroidAutofillTargetMatch(item, autofillRequest)}
                        match={matchByItemId.get(item.id) ?? null}
                        density={density}
                      />
                    )}
                  </BulkSelectWrapper>
                </motion.div>
              ))}
            </AnimatePresence>
          )}

          {visibleCount < filteredItems.length && (
            <button
              ref={sentinelRef}
              type="button"
              data-testid="vault-list-load-more"
              onClick={loadMore}
              className="mt-2 w-full rounded-lg border border-outline-variant/15 bg-surface-low/70 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant hover:border-brand-primary/25 hover:bg-brand-primary/5 hover:text-brand-primary transition-all cursor-pointer"
            >
              {t('common.loadMore', 'Daha fazla göster')}
              <span className="ml-2 font-mono text-[10px] opacity-70">
                {visibleCount}/{filteredItems.length}
              </span>
            </button>
          )}
        </div>
      </section>

      <section
        className={`flex-1 min-h-0 p-3 sm:p-4 lg:p-6 overflow-y-auto scrollbar-hide bg-brand-bg safe-bottom ${
          mobileActiveView === 'list' ? 'hidden lg:block' : 'block'
        }`}
      >
        {selectedItem ? (
          <VaultItemDetailPanel
            item={selectedItem}
            copiedField={copiedField}
            score={score}
            isPasswordRevealed={isPasswordRevealed}
            isCardNumberRevealed={isCardNumberRevealed}
            isCvvRevealed={isCvvRevealed}
            isPinRevealed={isPinRevealed}
            isPasskeyPrivateExponentRevealed={isPasskeyPrivateExponentRevealed}
            totpCountdown={totpCountdown}
            onBackToList={onBackToList}
            onOpenAudit={onOpenAudit}
            onToggleFavorite={onToggleFavorite}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleReveal={onToggleReveal}
            onCopyText={onCopyText}
            onDownloadAttachment={onDownloadAttachment}
            isAutofillMode={isAutofillMode}
            autofillRequest={autofillRequest}
            onApproveAutofill={onApproveAutofill}
            onSecureShare={() => onSecureShare(selectedItem)}
          />
        ) : (
          <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5 py-2 sm:py-4 lg:py-5 animate-fade-in text-left">
            <div className="lg:hidden sticky top-0 z-20 -mx-3 px-3 py-2 mb-1 bg-brand-bg/95 backdrop-blur border-b border-outline-variant/10 flex items-center justify-between">
              <button
                type="button"
                onClick={onBackToList}
                className="flex items-center gap-2 text-xs font-bold bg-[#1a1c1a] border border-outline-variant/15 px-3 py-2 rounded-lg text-on-surface hover:text-brand-primary active:scale-95 transition-all cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-brand-primary" strokeWidth={2.5} />
                <span>{t('detail.mobile.back')}</span>
              </button>
              <div className="flex items-center gap-2">
                <span className="w-9 h-9 rounded-lg bg-brand-primary/10 border border-brand-primary/15 flex items-center justify-center text-brand-primary">
                  <LayoutDashboard className="w-4 h-4" />
                </span>
                <button
                  type="button"
                  data-testid="mobile-dashboard-lock-button"
                  onClick={onLock}
                  className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-400/20 flex items-center justify-center text-red-300 hover:text-red-200 hover:bg-red-500/15 focus:outline-none focus:ring-1 focus:ring-red-300/40 active:scale-95 transition-all cursor-pointer"
                  title={t('nav.lockVault')}
                  aria-label={t('nav.lockVault')}
                >
                  <Lock className="w-4 h-4" />
                </button>
              </div>
            </div>

            <DashboardHeader profileName={profileName} onOpenProfile={onOpenProfile} onLock={onLock} />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5">
              <DashboardSecurityScoreCard auditReport={auditReport} activeItemCount={activeItems.length} />

              <DashboardCategoryStats
                loginCount={loginCount}
                cardCount={cardCount}
                secureNoteCount={secureNoteCount}
              />
            </div>

            <DashboardQuickActions
              onNewItem={onNewItem}
              onOpenAudit={onOpenAudit}
              onOpenGenerator={onOpenGenerator}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 animate-fade-in text-left">
              <RecentVaultPanel
                items={activeItems}
                copiedField={copiedField}
                onSelect={onSelectItem}
                onCopyText={onCopyText}
              />

              <CryptoShieldPanel />
            </div>

            <AegisGuardReport auditReport={auditReport} />
          </div>
        )}
      </section>
    </>
  );
}

// Memoize VaultWorkspace to prevent unnecessary re-renders when parent updates
// but props haven't changed. This is critical for large vault imports (600+ items)
// where massive state updates would otherwise cause the entire component tree to re-render.
export default memo(VaultWorkspaceContent);
