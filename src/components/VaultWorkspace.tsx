import { Fragment } from 'react';
import { Heart, LayoutDashboard, Plus } from 'lucide-react';

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
  onToggleFavorite: (item: VaultItem) => void;
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
  return (
    <>
      <section
        className={`w-full lg:w-[400px] border-r border-outline-variant/10 flex flex-col bg-surface-lowest/40 overflow-y-auto scrollbar-hide ${
          selectedItem && mobileActiveView === 'detail' ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="p-6 pb-2 space-y-3">
          <h2 className="font-display text-lg font-bold text-on-surface flex items-center justify-between">
            <span>Kişisel Kasa</span>
            <button
              onClick={onNewItem}
              className="text-on-surface-variant hover:text-brand-primary transition-all cursor-pointer"
              title="Yeni Şifre Ekle"
            >
              <Plus className="w-5 h-5" />
            </button>
          </h2>

          <div className="flex bg-[#161816]/70 p-1 rounded-lg border border-outline-variant/15 text-xs">
            <button
              onClick={() => onSetFavoritesOnly(false)}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all text-center cursor-pointer ${
                !filterFavoritesOnly
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Tümü ({activeItems.length})
            </button>
            <button
              onClick={() => onSetFavoritesOnly(true)}
              className={`flex-1 py-1.5 rounded-md font-bold transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer ${
                filterFavoritesOnly
                  ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Heart className="w-3.5 h-3.5 fill-red-500 text-red-500" />
              <span>Favoriler ({favoriteCount})</span>
            </button>
          </div>

          <p className="text-on-surface-variant text-xs mt-1">
            {filteredItems.length} öğe listeleniyor
          </p>
        </div>

        <div className="flex flex-col p-3 space-y-1.5">
          <div
            onClick={onSelectDashboard}
            className={`group p-3 mb-2 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
              selectedItem === null
                ? 'border-brand-primary/20 bg-brand-primary/10 shadow-[0_0_15px_rgba(220,225,255,0.03)]'
                : 'border-outline-variant/10 hover:border-brand-primary/10 hover:bg-[#1a1c1a]/30'
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center border border-brand-primary/25 shrink-0 select-none">
              <LayoutDashboard className="w-4.5 h-4.5 text-brand-primary group-hover:rotate-6 transition-transform" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-xs text-brand-primary tracking-wider uppercase flex items-center gap-1.5">
                <span>Aegis Kontrol Paneli</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              </h3>
              <p className="text-[10px] text-on-surface-variant font-mono truncate">Detaylı istatistikleri ve analizleri gör</p>
            </div>
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-center py-10 px-4 text-xs text-on-surface-variant/40 italic">
              Arama sonucu veya kayıtlı favori veri bulunamadı. Ekle butonuna tıklayarak yeni veri oluşturabilirsiniz.
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
        className={`flex-1 p-4 lg:p-8 overflow-y-auto scrollbar-hide bg-[#0c0d0c]/30 ${
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
          <div className="max-w-4xl mx-auto space-y-8 py-4 lg:py-6 animate-fade-in text-left">
            <DashboardHeader profileName={profileName} onOpenProfile={onOpenProfile} />

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in text-left">
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
