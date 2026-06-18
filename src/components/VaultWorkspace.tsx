import React, { Fragment, useState, useEffect, memo } from 'react';
import { ArrowLeft, CreditCard, FileText, Fingerprint, Heart, KeyRound, Layers, LayoutDashboard, Lock, Plus, Search, Smartphone, User, X } from 'lucide-react';

import type { VaultCategoryFilter } from '../hooks/useVaultFilters';

import { useLanguage } from '../i18n/LanguageContext';
import { androidAutofillTargetLabel, type AndroidAutofillRequest } from '../lib/androidAutofill';
import { AuditReport, VaultItem } from '../types';
import AegisGuardReport from './AegisGuardReport';
import CryptoShieldPanel from './CryptoShieldPanel';
import DashboardCategoryStats from './DashboardCategoryStats';
import DashboardHeader from './DashboardHeader';
import DashboardQuickActions from './DashboardQuickActions';
import DashboardSecurityScoreCard from './DashboardSecurityScoreCard';
import RecentVaultPanel from './RecentVaultPanel';
import VaultItemDetailPanel from './VaultItemDetailPanel';
import VaultListItem from './VaultListItem';

interface VaultWorkspaceProps {
  selectedItem: VaultItem | null;
  mobileActiveView: 'list' | 'detail';
  filteredItems: VaultItem[];
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
}

export function VaultWorkspaceContent({
  selectedItem,
  mobileActiveView,
  filteredItems,
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
}: VaultWorkspaceProps) {
  const { t } = useLanguage();
  const autofillTargetLabel = androidAutofillTargetLabel(autofillRequest);

  const [visibleCount, setVisibleCount] = useState(30);

  // Reset visibleCount if search query or filters change
  useEffect(() => {
    setVisibleCount(30);
  }, [filteredItems]);

  // We can automatically slice and load more on scroll
  const handleListScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    // Check if we are near the bottom of the scroll container
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 300) {
      if (visibleCount < filteredItems.length) {
        setVisibleCount((prev) => Math.min(prev + 30, filteredItems.length));
      }
    }
  };

  const displayedItems = filteredItems.slice(0, visibleCount);

  return (
    <>
      <section
        className={`w-full lg:w-[480px] xl:w-[540px] border-r border-outline-variant/15 flex flex-col bg-surface-lowest/55 h-full ${
          mobileActiveView === 'detail' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="p-5 pb-2 space-y-3 shrink-0">
          <h2 className="font-display text-lg font-bold text-on-surface flex items-center justify-between">
            <span>{t('vaultList.title')}</span>
            <button
              data-testid="new-vault-item-button"
              onClick={onNewItem}
              className="toolbar-button cursor-pointer"
              title={t('vaultList.newItem')}
            >
              <Plus className="w-5 h-5" />
            </button>
          </h2>

          <div className="flex bg-surface-low p-1 rounded-lg border border-outline-variant/15 text-xs">
            <button
              data-testid="vault-filter-all"
              onClick={() => {
                onSetFavoritesOnly(false);
                setVisibleCount(30);
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
                setVisibleCount(30);
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
            ]).map((cat) => (
              <button
                key={cat.key}
                type="button"
                data-testid={`category-chip-${cat.key}`}
                onClick={() => {
                  onSelectCategory(cat.key);
                  setVisibleCount(30);
                }}
                className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat.key
                    ? 'bg-brand-primary/15 text-brand-primary border-brand-primary/25'
                    : 'bg-transparent text-on-surface-variant/70 border-outline-variant/10 hover:text-on-surface hover:bg-surface-low/60'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span className={`ml-0.5 font-mono text-[9px] ${
                  selectedCategory === cat.key ? 'text-brand-primary/70' : 'text-on-surface-variant/40'
                }`}>{cat.count}</span>
              </button>
            ))}
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
          onScroll={handleListScroll}
          className="flex-1 overflow-y-auto p-3 pt-0 space-y-1.5 scrollbar-hide"
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
            displayedItems.map((item) => (
              <Fragment key={item.id}>
                <VaultListItem
                  item={item}
                  isSelected={selectedItem?.id === item.id}
                  onSelect={onSelectItem}
                />
              </Fragment>
            ))
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
