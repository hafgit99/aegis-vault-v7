import { Fragment } from 'react';
import { Heart, LayoutDashboard, Plus } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
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
  onOpenAudit: () => void;
  onOpenGenerator: () => void;
  onSetFavoritesOnly: (value: boolean) => void;
  onSelectDashboard: () => void;
  onBackToList: () => void;
  onSelectItem: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void | Promise<void>;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggleReveal: (field: 'password' | 'cardNumber' | 'cardCvv' | 'cardPin' | 'passkeyPrivateExponent') => void;
  onCopyText: (text: string, field: string) => void;
  onDownloadAttachment: (id: string, name: string) => void;
}

export default function VaultWorkspace({
  selectedItem,
  mobileActiveView,
  filteredItems,
  activeItems,
  filterFavoritesOnly,
  favoriteCount,
  loginCount,
  cardCount,
  secureNoteCount,
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
  onOpenAudit,
  onOpenGenerator,
  onSetFavoritesOnly,
  onSelectDashboard,
  onBackToList,
  onSelectItem,
  onToggleFavorite,
  onEdit,
  onDelete,
  onToggleReveal,
  onCopyText,
  onDownloadAttachment,
}: VaultWorkspaceProps) {
  const { t } = useLanguage();

  return (
    <>
      <section
        className={`w-full lg:w-[384px] border-r border-outline-variant/15 flex flex-col bg-surface-lowest/55 overflow-y-auto scrollbar-hide ${
          selectedItem && mobileActiveView === 'detail' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="p-5 pb-2 space-y-3">
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
              onClick={() => onSetFavoritesOnly(false)}
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
              onClick={() => onSetFavoritesOnly(true)}
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

          <p className="text-on-surface-variant text-xs mt-1">
            {filteredItems.length} {t('vaultList.itemsListed')}
          </p>
        </div>

        <div className="flex flex-col p-3 space-y-1.5">
          <div
            onClick={onSelectDashboard}
            className={`group p-3 mb-2 rounded-lg border flex items-center gap-3 cursor-pointer transition-all ${
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
          </div>

          {filteredItems.length === 0 ? (
            <div
              data-testid="vault-empty-state"
              className="text-center py-10 px-4 text-xs text-on-surface-variant/40 italic"
            >
              {t('vaultList.empty')}
            </div>
          ) : (
            filteredItems.map((item) => (
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
        className={`flex-1 p-4 lg:p-6 overflow-y-auto scrollbar-hide bg-brand-bg ${
          !selectedItem || mobileActiveView === 'list' ? 'hidden lg:block' : 'block'
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
          />
        ) : (
          <div className="max-w-5xl mx-auto space-y-6 py-4 lg:py-5 animate-fade-in text-left">
            <DashboardHeader profileName={profileName} onOpenProfile={onOpenProfile} />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 animate-fade-in text-left">
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
