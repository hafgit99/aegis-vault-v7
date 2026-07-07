import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { VaultCategoryFilter } from '../hooks/useVaultFilters';
import type { AndroidAutofillRequest } from '../lib/androidAutofill';
import { ActiveTab, AppNotification, AuditReport, VaultItem } from '../types';
import PasswordGenerator from './PasswordGenerator';
import SecurityAudit from './SecurityAudit';
import SettingsPanel from './SettingsPanel';
import TrashWorkspace from './TrashWorkspace';
import VaultWorkspace from './VaultWorkspace';
import DonationPanel from './DonationPanel';

interface MainContentProps {
  activeTab: ActiveTab;
  selectedItem: VaultItem | null;
  mobileActiveView: 'list' | 'detail';
  filteredItems: VaultItem[];
  activeItems: VaultItem[];
  trashItems: VaultItem[];
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
  autoLockDuration: number;
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
  onSelectAuditItem: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void | Promise<void>;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggleReveal: (field: 'password' | 'cardNumber' | 'cardCvv' | 'cardPin' | 'passkeyPrivateExponent') => void;
  onCopyText: (text: string, field: string) => void;
  onDownloadAttachment: (id: string, name: string) => void;
  onDatabaseChanged: () => void | Promise<void>;
  onAutoLockDurationChange: (duration: number) => void;
  onNotify: (notification: AppNotification) => void;
  onEmptyTrash: () => void;
  onRestoreTrashItem: (item: VaultItem) => void;
  onDeleteTrashItemPermanently: (item: VaultItem) => void;
  isAutofillMode?: boolean;
  autofillRequest?: AndroidAutofillRequest | null;
  onCancelAutofill?: () => void;
  onApproveAutofill?: (item: VaultItem) => void;
  onUpdateItemCategory?: (itemId: string, category: VaultItem['category']) => void;
}

export function MainContentComponent({
  activeTab,
  selectedItem,
  mobileActiveView,
  filteredItems,
  activeItems,
  trashItems,
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
  autoLockDuration,
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
  onSelectAuditItem,
  onToggleFavorite,
  onEdit,
  onDelete,
  onToggleReveal,
  onCopyText,
  onDownloadAttachment,
  onDatabaseChanged,
  onAutoLockDurationChange,
  onNotify,
  onEmptyTrash,
  onRestoreTrashItem,
  onDeleteTrashItemPermanently,
  isAutofillMode = false,
  autofillRequest = null,
  onCancelAutofill,
  onApproveAutofill,
  onUpdateItemCategory,
}: MainContentProps) {
  return (
    <div className="flex flex-1 overflow-hidden relative">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          className="flex-1 flex overflow-hidden min-h-0"
        >
          {activeTab === 'vault' && (
            <VaultWorkspace
              selectedItem={selectedItem}
              mobileActiveView={mobileActiveView}
              filteredItems={filteredItems}
              activeItems={activeItems}
              filterFavoritesOnly={filterFavoritesOnly}
              favoriteCount={favoriteCount}
              loginCount={loginCount}
              cardCount={cardCount}
              secureNoteCount={secureNoteCount}
              passkeyCount={passkeyCount}
              identityCount={identityCount}
              selectedCategory={selectedCategory}
              auditReport={auditReport}
              profileName={profileName}
              copiedField={copiedField}
              score={score}
              isPasswordRevealed={isPasswordRevealed}
              isCardNumberRevealed={isCardNumberRevealed}
              isCvvRevealed={isCvvRevealed}
              isPinRevealed={isPinRevealed}
              isPasskeyPrivateExponentRevealed={isPasskeyPrivateExponentRevealed}
              totpCountdown={totpCountdown}
              onNewItem={onNewItem}
              onOpenProfile={onOpenProfile}
              onLock={onLock}
              onOpenAudit={onOpenAudit}
              onOpenGenerator={onOpenGenerator}
              onSetFavoritesOnly={onSetFavoritesOnly}
              onSelectCategory={onSelectCategory}
              onSelectDashboard={onSelectDashboard}
              onBackToList={onBackToList}
              onSelectItem={onSelectItem}
              onToggleFavorite={onToggleFavorite}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleReveal={onToggleReveal}
              onCopyText={onCopyText}
              onDownloadAttachment={onDownloadAttachment}
              isAutofillMode={isAutofillMode}
              autofillRequest={autofillRequest}
              onCancelAutofill={onCancelAutofill}
              onApproveAutofill={onApproveAutofill}
              onUpdateItemCategory={onUpdateItemCategory}
            />
          )}

          {activeTab === 'audit' && (
            <div data-testid="audit-workspace" className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
              <SecurityAudit items={activeItems} onSelectItem={onSelectAuditItem} />
            </div>
          )}

          {activeTab === 'generator' && (
            <div data-testid="generator-workspace" className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
              <PasswordGenerator onCopyText={onCopyText} copiedField={copiedField} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div data-testid="settings-workspace" className="flex-1 p-3 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
              <SettingsPanel
                onDatabaseChanged={onDatabaseChanged}
                autoLockDuration={autoLockDuration}
                onAutoLockDurationChange={onAutoLockDurationChange}
                onNotify={onNotify}
              />
            </div>
          )}

          {activeTab === 'donate' && (
            <div data-testid="donate-workspace" className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto scrollbar-hide safe-bottom">
              <DonationPanel copiedField={copiedField} onCopyText={onCopyText} />
            </div>
          )}

          {activeTab === 'trash' && (
            <TrashWorkspace
              items={trashItems}
              onEmptyTrash={onEmptyTrash}
              onRestore={onRestoreTrashItem}
              onDeletePermanently={onDeleteTrashItemPermanently}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// Memoize MainContent to prevent unnecessary re-renders from parent (App) updates.
// This prevents the entire content area from re-rendering when unrelated state changes.
export default memo(MainContentComponent);
