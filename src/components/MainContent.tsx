import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import type { VaultCategoryFilter } from '../hooks/useVaultFilters';
import type { AndroidAutofillRequest } from '../lib/androidAutofill';
import type { FilteredVaultItem } from '../hooks/useVaultQueries';
import type { ActiveTab, AppNotification, AuditReport, VaultItem } from '../types';
import type { SmartFolder, TagColorKey, TagDefinition, VaultFolder } from '../types';
import type { CreateSmartFolderInput } from '../lib/smartFolders';
import type { UseBulkSelectionResult } from '../hooks/useOrganisation';
import TrashWorkspace from './TrashWorkspace';
import VaultPage from '../pages/VaultPage';
import { AuditPage } from '../pages/AuditPage';
import { GeneratorPage } from '../pages/GeneratorPage';
import { SettingsPage } from '../pages/SettingsPage';
import { DonatePage } from '../pages/DonatePage';

interface MainContentProps {
  activeTab: ActiveTab;
  selectedItem: VaultItem | null;
  mobileActiveView: 'list' | 'detail';
  filteredItems: VaultItem[];
  /** Item entries enriched with fuzzy match metadata, used for highlighting. */
  filteredItemResults: FilteredVaultItem[];
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
  onSecureShare?: (item: VaultItem) => void;
  isAutofillMode?: boolean;
  autofillRequest?: AndroidAutofillRequest | null;
  onCancelAutofill?: () => void;
  onApproveAutofill?: (item: VaultItem) => void;
  onUpdateItemCategory?: (itemId: string, category: VaultItem['category']) => void;
  // 5.3 — Tagging & Organisation
  tags?: TagDefinition[];
  folders?: VaultFolder[];
  smartFolders?: SmartFolder[];
  smartFolderCounts?: Record<string, number>;
  selectedFolderId?: string | null;
  activeSmartFolderId?: string | null;
  onSelectFolder?: (folderId: string | null) => void;
  onSelectSmartFolder?: (id: string | null) => void;
  onCreateFolder?: (parentId: string | null) => void;
  onDeleteFolder?: (folderId: string) => void;
  onCreateTag?: (input: { name: string; color?: TagColorKey }) => TagDefinition | null;
  onUpdateTag?: (id: string, patch: { name?: string; color?: TagColorKey }) => void;
  onDeleteTag?: (id: string) => void;
  onItemsChange?: (next: VaultItem[]) => void;
  bulkSelection?: UseBulkSelectionResult;
  onCreateSmartFolder?: (input: CreateSmartFolderInput) => SmartFolder;
  onDeleteSmartFolder?: (id: string) => void;
}

/**
 * Tab router for the unlocked application. Each tab renders a dedicated
 * page component from `src/pages`; this component only owns the shared
 * transition animation and prop forwarding.
 */
export function MainContentComponent({
  activeTab,
  trashItems,
  onEmptyTrash,
  onRestoreTrashItem,
  onDeleteTrashItemPermanently,
  ...pageProps
}: MainContentProps) {
  return (
    <div className="flex flex-1 overflow-hidden relative min-w-0 max-w-full w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          className="flex-1 flex overflow-hidden min-h-0 min-w-0 max-w-full w-full"
        >
          {activeTab === 'vault' && <VaultPage {...pageProps} />}

          {activeTab === 'audit' && (
            <AuditPage activeItems={pageProps.activeItems} onSelectAuditItem={pageProps.onSelectAuditItem} />
          )}

          {activeTab === 'generator' && (
            <GeneratorPage copiedField={pageProps.copiedField} onCopyText={pageProps.onCopyText} />
          )}

          {activeTab === 'settings' && (
            <SettingsPage
              autoLockDuration={pageProps.autoLockDuration}
              onDatabaseChanged={pageProps.onDatabaseChanged}
              onAutoLockDurationChange={pageProps.onAutoLockDurationChange}
              onNotify={pageProps.onNotify}
            />
          )}

          {activeTab === 'donate' && (
            <DonatePage copiedField={pageProps.copiedField} onCopyText={pageProps.onCopyText} />
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
