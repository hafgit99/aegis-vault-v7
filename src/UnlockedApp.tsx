/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback } from 'react';
import MobileSidebarBackdrop from './components/MobileSidebarBackdrop';
import SidebarNavigation from './components/SidebarNavigation';
import TopBar from './components/TopBar';
import MainContent from './components/MainContent';
import FloatingVaultAction from './components/FloatingVaultAction';
import { PrivacyShieldBackdrop } from './components/PrivacyShieldBackdrop';
import { CopiedToastNotification } from './components/CopiedToastNotification';
import AppModals from './components/AppModals';
import { SensitiveRevealProvider } from './context/SensitiveRevealContext';
import { useClipboardFeedback } from './hooks/useClipboardFeedback';
import { useSensitiveReveal } from './hooks/useSensitiveReveal';
import { useVaultQueries } from './hooks/useVaultQueries';
import { useVaultSelection } from './hooks/useVaultSelection';
import { useProfileSettings } from './hooks/useProfileSettings';
import { useConfirmModal } from './hooks/useConfirmModal';
import { useTotpCountdown } from './hooks/useTotpCountdown';
import { getTotpPeriod } from './lib/otp';
import { useVaultData } from './hooks/useVaultData';
import { useAttachmentDownload } from './hooks/useAttachmentDownload';
import { useTrashActions } from './hooks/useTrashActions';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useVaultFormState } from './hooks/useVaultFormState';
import { useVaultMobileView } from './hooks/useVaultMobileView';
import { useVaultFilters } from './hooks/useVaultFilters';
import { useUnlockedVaultRefresh } from './hooks/useUnlockedVaultRefresh';
import { useShareReceive } from './hooks/useShareReceive';
import { useSelectedItemScore } from './hooks/useSelectedItemScore';
import { useVaultStatusAction } from './hooks/useVaultStatusAction';
import { useRuntimeSecurity } from './hooks/useRuntimeSecurity';
import { useAndroidAutofillCoordinator } from './hooks/useAndroidAutofillCoordinator';
import { useAndroidRuntimeSecurity } from './hooks/useAndroidRuntimeSecurity';
import { useAssetIntegrity } from './hooks/useAssetIntegrity';
import { useAirgapAlerts } from './hooks/useAirgapAlerts';
import { useLinuxSecurityStatus } from './hooks/useLinuxSecurityStatus';
import { useExtensionCredentialSync } from './hooks/useExtensionCredentialSync';
import { useExtensionCredentialListener } from './hooks/useExtensionCredentialListener';
import { useKeyboardShortcuts, dispatchFocusSearchShortcut } from './hooks/useKeyboardShortcuts';
import { useVaultOrganisation } from './hooks/useVaultOrganisation';
import { useLanguage } from './i18n/LanguageContext';
import type { VaultItem } from './types';

interface UnlockedAppProps {
  unlocked: boolean;
  autoLockDuration: number;
  handleLock: () => void;
  handleAutoLockDurationChange: (duration: number) => void;
  backgroundLockDelayMs: number;
}

export default function UnlockedApp({
  unlocked,
  autoLockDuration,
  handleLock,
  handleAutoLockDurationChange,
  backgroundLockDelayMs,
}: UnlockedAppProps) {
  const { t } = useLanguage();
  const { copiedField, copyText: handleCopyText, clearCopiedField } = useClipboardFeedback();
  const { revealed, toggleReveal, resetReveals } = useSensitiveReveal();
  const isPasswordRevealed = revealed.password;
  const isCardNumRevealed = revealed.cardNumber;
  const isCvvRevealed = revealed.cardCvv;
  const isPinRevealed = revealed.cardPin;
  const isPasskeyExpRevealed = revealed.passkeyPrivateExponent;

  const {
    items,
    selectedItem,
    setItems,
    setSelectedItem,
    refreshDatabase,
    saveItem: handleSaveItem,
    saveItems: handleSaveItems,
    toggleFavorite: handleToggleFavorite,
  } = useVaultData();

  const totpCountdown = useTotpCountdown(getTotpPeriod(selectedItem?.totpSecret));

  const {
    activeTab,
    setActiveTab,
    isSidebarOpen,
    openSidebar: handleOpenSidebar,
    closeSidebar: handleCloseSidebar,
    changeTab: handleTabChange,
    openAuditTab: handleOpenAuditTab,
    openGeneratorTab: handleOpenGeneratorTab,
  } = useAppNavigation();

  const {
    isVaultFormOpen,
    editingItem,
    openNewItemForm: handleTriggerNew,
    openEditItemForm,
    closeVaultForm: handleCloseVaultForm,
  } = useVaultFormState();

  const {
    mobileActiveView,
    setMobileActiveView,
    selectDashboard: handleSelectDashboard,
    backToList: handleBackToList,
  } = useVaultMobileView({ setSelectedItem });

  const {
    searchQuery,
    setSearchQuery,
    commitSearch,
    filterFavoritesOnly,
    setFilterFavoritesOnly,
    selectedCategory,
    setSelectedCategory,
    fuzzyEnabled,
    setFuzzyEnabled,
    selectedTags,
    toggleTag,
    clearTags,
    dateRange,
    dateField,
    setDateField,
    updateDateRange,
    clearDateRange,
    recentSearches,
    removeRecentEntry,
    clearRecent,
    resetAdvancedFilters,
  } = useVaultFilters();

  const {
    confirmConfig,
    openConfirm,
    showNotification,
    closeConfirm: handleCloseConfirm,
  } = useConfirmModal();

  const {
    pendingAutofillRequest,
    cancelAutofillRequest: handleCancelAutofillRequest,
    approveAutofillRequest: handleApproveAutofillRequest,
  } = useAndroidAutofillCoordinator({
    unlocked,
    setActiveTab,
    openNewItemForm: handleTriggerNew,
    showNotification,
  });

  const { privacyShieldVisible, screenRecordingDetected } = useRuntimeSecurity({
    unlocked,
    onLock: handleLock,
    onSensitiveStateClear: () => {
      resetReveals();
      clearCopiedField();
    },
    backgroundLockDelayMs,
    isAutofillMode: Boolean(pendingAutofillRequest),
  });

  useAirgapAlerts({
    unlocked,
    onNotify: showNotification,
  });

  useAndroidRuntimeSecurity({
    unlocked,
    onNotify: showNotification,
  });

  useAssetIntegrity({
    unlocked,
    onNotify: showNotification,
  });

  useLinuxSecurityStatus({
    unlocked,
    onNotify: showNotification,
  });

  useExtensionCredentialSync(unlocked, items);

  const handleAddCredentialFromExtension = useCallback(
    (payload: { title: string; username: string; password: string; url: string }) => {
      handleTriggerNew({ ...payload, category: 'login' });
    },
    [handleTriggerNew],
  );

  useExtensionCredentialListener(handleAddCredentialFromExtension);

  // Share & Receive Modals state
  const {
    isShareOpen,
    sharingItem,
    isReceiveOpen,
    receivedPayload,
    openShare: handleSecureShare,
    closeShare: handleCloseShare,
    closeReceive: handleCloseReceive,
    importShare: handleImportShare,
  } = useShareReceive({
    onSaveItem: handleSaveItem,
    onNotify: showNotification,
  });

  const { openVaultStatus: handleOpenVaultStatus } = useVaultStatusAction({ openConfirm });

  const {
    profileName,
    profileAvatar,
    isProfileModalOpen,
    openProfile: handleOpenProfile,
    closeProfile: handleCloseProfile,
    saveProfile: handleSaveProfile,
  } = useProfileSettings({
    onSaved: () =>
      showNotification({
        title: t('profile.savedTitle'),
        message: t('profile.savedMessage'),
        type: 'success',
      }),
  });

  const { downloadAttachment: handleDownloadAttachment } = useAttachmentDownload({
    onNotify: showNotification,
  });

  const {
    deleteItem: handleDeleteItem,
    emptyTrash: handleEmptyTrash,
    restoreTrashItem: handleRestoreTrashItem,
    deleteTrashItemPermanently: handleDeleteTrashItemPermanently,
  } = useTrashActions({
    openConfirm,
    setItems,
    setSelectedItem,
    resetReveals,
    clearCopiedField,
  });

  useUnlockedVaultRefresh({
    unlocked,
    onRefresh: refreshDatabase,
  });

  const {
    tags,
    createTag,
    updateTag,
    deleteTag,
    folders,
    smartFolders,
    smartFolderCounts,
    createSmartFolder,
    deleteSmartFolder,
    bulkSelection,
    selectedFolderId,
    setSelectedFolderId,
    activeSmartFolderId,
    setActiveSmartFolderId,
    handleCreateFolder,
    handleDeleteFolder,
  } = useVaultOrganisation(items);

  const handleItemsChange = async (nextItems: VaultItem[]) => {
    await handleSaveItems(nextItems);
  };

  const {
    activeItems,
    trashItems,
    filteredItems,
    filteredItemResults,
    favoriteCount,
    loginCount,
    cardCount,
    secureNoteCount,
    passkeyCount,
    identityCount,
    auditReport,
  } = useVaultQueries({
    items,
    searchQuery,
    favoritesOnly: filterFavoritesOnly,
    selectedCategory,
    fuzzyEnabled,
    selectedTags,
    dateRange,
    dateField,
    selectedFolderId,
    activeSmartFolderId,
    folders,
    smartFolders,
  });

  const { selectItem: handleSelectItem, selectAuditItem: handleAuditSelectItem } = useVaultSelection({
    setSelectedItem,
    resetReveals,
    clearCopiedField,
    setActiveTab,
    setMobileActiveView,
  });

  const handleTriggerEdit = () => {
    openEditItemForm(selectedItem);
  };

  const handleUpdateItemCategory = async (itemId: string, newCategory: VaultItem['category']) => {
    const item = items.find(i => i.id === itemId);
    if (item) {
      const updatedItem = { ...item, category: newCategory, updatedAt: new Date().toISOString() };
      await handleSaveItem(updatedItem);
      showNotification({
        title: t('vaultForm.title.edit'),
        message: 'Category updated successfully / Kategori güncellendi',
        type: 'success',
      });
    }
  };

  const score = useSelectedItemScore(selectedItem);

  const handleManualRefresh = async () => {
    try {
      await refreshDatabase();
      showNotification({
        title: t('top.refreshSuccessTitle'),
        message: t('top.refreshSuccessMessage'),
        type: 'success',
      });
    } catch (err) {
      console.error(err);
      showNotification({
        title: t('top.refreshErrorTitle'),
        message: t('top.refreshErrorMessage'),
        type: 'danger',
      });
    }
  };

  useKeyboardShortcuts({
    enabled: unlocked,
    onFocusSearch: dispatchFocusSearchShortcut,
    onNewItem: handleTriggerNew,
    onLock: handleLock,
  });

  return (
    <SensitiveRevealProvider>
      <div className="safe-screen-fixed flex w-full bg-brand-bg text-on-surface overflow-hidden font-sans">
        <MobileSidebarBackdrop isOpen={isSidebarOpen} onClose={handleCloseSidebar} />

        <SidebarNavigation
          activeTab={activeTab}
          isOpen={isSidebarOpen}
          trashCount={trashItems.length}
          onTabChange={handleTabChange}
          onLock={handleLock}
        />

        <main className="lg:ml-[280px] ml-0 flex-1 flex flex-col min-h-0 min-w-0 max-w-full overflow-hidden bg-brand-bg">
          <TopBar
            activeTab={activeTab}
            searchQuery={searchQuery}
            profileName={profileName}
            profileAvatar={profileAvatar}
            onSearchChange={setSearchQuery}
            onOpenSidebar={handleOpenSidebar}
            onRefresh={handleManualRefresh}
            onOpenVaultStatus={handleOpenVaultStatus}
            onOpenProfile={handleOpenProfile}
            onLock={handleLock}
            fuzzyEnabled={fuzzyEnabled}
            onToggleFuzzy={setFuzzyEnabled}
            selectedTags={selectedTags}
            onToggleTag={toggleTag}
            onClearTags={clearTags}
            dateRange={dateRange}
            dateField={dateField}
            onDateFieldChange={setDateField}
            onChangeDateRange={updateDateRange}
            onClearDateRange={clearDateRange}
            onResetAdvancedFilters={resetAdvancedFilters}
            recentSearches={recentSearches}
            onRemoveRecentEntry={removeRecentEntry}
            onClearRecentSearches={clearRecent}
            onCommitSearch={commitSearch}
          />

          <MainContent
            activeTab={activeTab}
            selectedItem={selectedItem}
            mobileActiveView={mobileActiveView}
            filteredItems={filteredItems}
            filteredItemResults={filteredItemResults}
            activeItems={activeItems}
            trashItems={trashItems}
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
            isCardNumberRevealed={isCardNumRevealed}
            isCvvRevealed={isCvvRevealed}
            isPinRevealed={isPinRevealed}
            isPasskeyPrivateExponentRevealed={isPasskeyExpRevealed}
            totpCountdown={totpCountdown}
            autoLockDuration={autoLockDuration}
            onNewItem={handleTriggerNew}
            onOpenProfile={handleOpenProfile}
            onLock={handleLock}
            onOpenAudit={handleOpenAuditTab}
            onOpenGenerator={handleOpenGeneratorTab}
            onSetFavoritesOnly={setFilterFavoritesOnly}
            onSelectCategory={setSelectedCategory}
            onSelectDashboard={handleSelectDashboard}
            onBackToList={handleBackToList}
            onSelectItem={handleSelectItem}
            onSelectAuditItem={handleAuditSelectItem}
            onToggleFavorite={handleToggleFavorite}
            onEdit={handleTriggerEdit}
            onDelete={handleDeleteItem}
            onUpdateItemCategory={handleUpdateItemCategory}
            onToggleReveal={toggleReveal}
            onCopyText={handleCopyText}
            onDownloadAttachment={handleDownloadAttachment}
            onDatabaseChanged={refreshDatabase}
            onAutoLockDurationChange={handleAutoLockDurationChange}
            onNotify={showNotification}
            onEmptyTrash={handleEmptyTrash}
            onRestoreTrashItem={handleRestoreTrashItem}
            onDeleteTrashItemPermanently={handleDeleteTrashItemPermanently}
            tags={tags}
            folders={folders}
            smartFolders={smartFolders}
            smartFolderCounts={smartFolderCounts}
            selectedFolderId={selectedFolderId}
            activeSmartFolderId={activeSmartFolderId}
            onSelectFolder={setSelectedFolderId}
            onSelectSmartFolder={setActiveSmartFolderId}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            onCreateTag={createTag}
            onUpdateTag={updateTag}
            onDeleteTag={deleteTag}
            onItemsChange={handleItemsChange}
            bulkSelection={bulkSelection}
            onCreateSmartFolder={createSmartFolder}
            onDeleteSmartFolder={deleteSmartFolder}
            isAutofillMode={Boolean(pendingAutofillRequest)}
            autofillRequest={pendingAutofillRequest}
            onCancelAutofill={handleCancelAutofillRequest}
            onApproveAutofill={handleApproveAutofillRequest}
            onSecureShare={handleSecureShare}
          />
        </main>

        {selectedItem === null && <FloatingVaultAction onNewItem={handleTriggerNew} />}

        <PrivacyShieldBackdrop
          visible={privacyShieldVisible}
          screenRecordingDetected={screenRecordingDetected}
        />

        <AppModals
          isVaultFormOpen={isVaultFormOpen}
          editingItem={editingItem}
          isProfileOpen={isProfileModalOpen}
          profileAvatar={profileAvatar}
          profileName={profileName}
          confirmConfig={confirmConfig}
          onCloseVaultForm={handleCloseVaultForm}
          onSaveVaultItem={handleSaveItem}
          onNotify={showNotification}
          onCloseProfile={handleCloseProfile}
          onSaveProfile={handleSaveProfile}
          onCancelConfirm={handleCloseConfirm}
          folders={folders}
          tags={tags}
          isShareOpen={isShareOpen}
          sharingItem={sharingItem}
          onCloseShare={handleCloseShare}
          isReceiveOpen={isReceiveOpen}
          receivedPayload={receivedPayload}
          onCloseReceive={handleCloseReceive}
          onImportShare={handleImportShare}
        />

        <CopiedToastNotification copiedField={copiedField} />
      </div>
    </SensitiveRevealProvider>
  );
}
