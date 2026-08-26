import { useState } from 'react';

import type { VaultCategoryFilter } from '../hooks/useVaultFilters';
import type { AndroidAutofillRequest } from '../lib/androidAutofill';
import type { FilteredVaultItem } from '../hooks/useVaultQueries';
import type { AuditReport, SmartFolder, TagColorKey, TagDefinition, VaultFolder, VaultItem } from '../types';
import type { CreateSmartFolderInput } from '../lib/smartFolders';
import { useBulkActionRunner, type UseBulkSelectionResult } from '../hooks/useOrganisation';
import type { BulkActionDescriptor } from '../components/BulkActionBar';
import OrganisationSidebar from '../components/OrganisationSidebar';
import VaultWorkspace from '../components/VaultWorkspace';

const defaultBulkSelection: UseBulkSelectionResult = {
  selectedIds: new Set<string>(),
  isSelectionMode: false,
  selectionCount: 0,
  isSelected: () => false,
  toggle: () => {},
  selectOnly: () => {},
  selectAll: () => {},
  clear: () => {},
  selectRange: () => {},
  enterSelectionMode: () => {},
  exitSelectionMode: () => {},
};

interface VaultPageProps {
  selectedItem: VaultItem | null;
  mobileActiveView: 'list' | 'detail';
  filteredItems: VaultItem[];
  /** Item entries enriched with fuzzy match metadata, used for highlighting. */
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
  onSelectAuditItem: (item: VaultItem) => void;
  onToggleFavorite: (item: VaultItem) => void | Promise<void>;
  onEdit: () => void;
  onDelete: (id: string) => void;
  onToggleReveal: (field: 'password' | 'cardNumber' | 'cardCvv' | 'cardPin' | 'passkeyPrivateExponent') => void;
  onCopyText: (text: string, field: string) => void;
  onDownloadAttachment: (id: string, name: string) => void;
  onUpdateItemCategory?: (itemId: string, category: VaultItem['category']) => void;
  onItemsChange?: (next: VaultItem[]) => void;
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
  bulkSelection?: UseBulkSelectionResult;
  onCreateSmartFolder?: (input: CreateSmartFolderInput) => SmartFolder;
  onDeleteSmartFolder?: (id: string) => void;
  onSecureShare?: (item: VaultItem) => void;
  isAutofillMode?: boolean;
  autofillRequest?: AndroidAutofillRequest | null;
  onCancelAutofill?: () => void;
  onApproveAutofill?: (item: VaultItem) => void;
}

export function VaultPage({
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
  onSelectAuditItem,
  onToggleFavorite,
  onEdit,
  onDelete,
  onToggleReveal,
  onCopyText,
  onDownloadAttachment,
  onUpdateItemCategory,
  onItemsChange = () => {},
  tags = [],
  folders = [],
  smartFolders = [],
  smartFolderCounts = {},
  selectedFolderId = null,
  activeSmartFolderId = null,
  onSelectFolder = () => {},
  onSelectSmartFolder = () => {},
  onCreateFolder = () => {},
  onDeleteFolder = () => {},
  onCreateTag = () => null,
  onUpdateTag = () => {},
  onDeleteTag = () => {},
  bulkSelection = defaultBulkSelection,
  onCreateSmartFolder = (input: CreateSmartFolderInput): SmartFolder => ({
    id: 'dummy',
    name: input.name,
    rules: input.rules,
    icon: input.icon ?? 'folder',
    color: input.color ?? 'indigo',
    createdAt: new Date().toISOString(),
  }),
  onDeleteSmartFolder = () => {},
  onSecureShare = () => {},
  isAutofillMode = false,
  autofillRequest = null,
  onCancelAutofill,
  onApproveAutofill,
}: VaultPageProps) {
  const [isFolderSidebarOpen, setIsFolderSidebarOpen] = useState(false);
  const runBulkAction = useBulkActionRunner(activeItems, onItemsChange);

  const handleApplyBulkAction = (action: BulkActionDescriptor) => {
    runBulkAction({
      kind: action.kind,
      ids: bulkSelection.selectedIds,
      tag: 'tag' in action ? action.tag : undefined,
      folderId: 'folderId' in action ? action.folderId : undefined,
    });
    bulkSelection.clear();
  };

  const handleSelectFolder = (id: string | null) => {
    onSelectFolder(id);
    setIsFolderSidebarOpen(false);
  };

  const handleSelectSmartFolder = (id: string | null) => {
    onSelectSmartFolder(id);
    setIsFolderSidebarOpen(false);
  };

  return (
    <>
      {isFolderSidebarOpen && (
        <div
          className="fixed inset-0 bg-[#000000]/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsFolderSidebarOpen(false)}
        />
      )}
      <OrganisationSidebar
        folders={folders}
        tags={tags}
        smartFolders={smartFolders}
        smartFolderCounts={smartFolderCounts}
        items={activeItems}
        activeFolderId={selectedFolderId}
        activeSmartFolderId={activeSmartFolderId}
        onSelectFolder={handleSelectFolder}
        onSelectSmartFolder={handleSelectSmartFolder}
        onCreateFolder={onCreateFolder}
        onDeleteFolder={onDeleteFolder}
        onCreateTag={onCreateTag}
        onUpdateTag={onUpdateTag}
        onDeleteTag={onDeleteTag}
        onCreateSmartFolder={onCreateSmartFolder}
        onDeleteSmartFolder={onDeleteSmartFolder}
        isOpen={isFolderSidebarOpen}
      />
      <VaultWorkspace
        selectedItem={selectedItem}
        mobileActiveView={mobileActiveView}
        filteredItems={filteredItems}
        filteredItemResults={filteredItemResults}
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
        onSelectAuditItem={onSelectAuditItem}
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
        bulkSelection={bulkSelection}
        folders={folders}
        tags={tags}
        onApplyBulkAction={handleApplyBulkAction}
        onSecureShare={onSecureShare}
        onOpenFolderSidebar={() => setIsFolderSidebarOpen(true)}
      />
    </>
  );
}

export default VaultPage;
