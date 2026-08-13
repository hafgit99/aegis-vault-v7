/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import MobileSidebarBackdrop from './components/MobileSidebarBackdrop';
import SidebarNavigation from './components/SidebarNavigation';
import TopBar from './components/TopBar';
import MainContent from './components/MainContent';
import FloatingVaultAction from './components/FloatingVaultAction';
import { PrivacyShieldBackdrop } from './components/PrivacyShieldBackdrop';
import { CopiedToastNotification } from './components/CopiedToastNotification';
import AppModals from './components/AppModals';
import { useClipboardFeedback } from './hooks/useClipboardFeedback';
import { useSensitiveReveal } from './hooks/useSensitiveReveal';
import { useVaultQueries } from './hooks/useVaultQueries';
import { useVaultSelection } from './hooks/useVaultSelection';
import { useProfileSettings } from './hooks/useProfileSettings';
import { useConfirmModal } from './hooks/useConfirmModal';
import { useTotpCountdown } from './hooks/useTotpCountdown';
import { useVaultData } from './hooks/useVaultData';
import { useAttachmentDownload } from './hooks/useAttachmentDownload';
import { useTrashActions } from './hooks/useTrashActions';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useVaultFormState } from './hooks/useVaultFormState';
import { useVaultMobileView } from './hooks/useVaultMobileView';
import { useVaultFilters } from './hooks/useVaultFilters';
import { useUnlockedVaultRefresh } from './hooks/useUnlockedVaultRefresh';
import { useSelectedItemScore } from './hooks/useSelectedItemScore';
import { useVaultStatusAction } from './hooks/useVaultStatusAction';
import { useRuntimeSecurity } from './hooks/useRuntimeSecurity';
import { useAndroidAutofillCoordinator } from './hooks/useAndroidAutofillCoordinator';
import { useAndroidRuntimeSecurity } from './hooks/useAndroidRuntimeSecurity';
import { useAssetIntegrity } from './hooks/useAssetIntegrity';
import { useLanguage } from './i18n/LanguageContext';
import { useAirgapAlerts } from './hooks/useAirgapAlerts';
import { VaultItem } from './types';
import {
  useTagLibrary,
  useVaultFolders,
  useSmartFolders,
  useBulkSelection,
} from './hooks/useOrganisation';
import { syncExtensionCredentials, clearExtensionCredentials } from './lib/desktopStorage';
import { decryptShareUrl, type DecryptedSharePayload } from './lib/share';

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

  const totpCountdown = useTotpCountdown();

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
    items,
    selectedItem,
    setItems,
    setSelectedItem,
    refreshDatabase,
    saveItem: handleSaveItem,
    saveItems: handleSaveItems,
    toggleFavorite: handleToggleFavorite,
  } = useVaultData();

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

  const { failureReason: assetIntegrityFailure } = useAssetIntegrity({
    unlocked,
    onNotify: showNotification,
  });

  // Share & Receive Modals state
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [sharingItem, setSharingItem] = useState<VaultItem | null>(null);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [receivedPayload, setReceivedPayload] = useState<DecryptedSharePayload | null>(null);

  const handleSecureShare = (item: VaultItem) => {
    setSharingItem(item);
    setIsShareOpen(true);
  };

  const handleCloseShare = () => {
    setIsShareOpen(false);
    setSharingItem(null);
  };

  const handleCloseReceive = () => {
    setIsReceiveOpen(false);
    setReceivedPayload(null);
    window.history.replaceState(null, '', window.location.pathname);
  };

  const handleImportShare = async (itemData: Partial<VaultItem>) => {
    try {
      const now = new Date().toISOString().split('T')[0];
      const newItem: VaultItem = {
        id: crypto.randomUUID(),
        title: itemData.title || 'Shared Item',
        username: itemData.username || '',
        password: itemData.password || '',
        url: itemData.url || '',
        notes: itemData.notes || '',
        category: itemData.category || 'login',
        totpSecret: itemData.totpSecret || '',
        favorite: false,
        createdAt: now,
        updatedAt: now,
      };

      await handleSaveItem(newItem);
      showNotification({
        type: 'success',
        message: t('share.success.import') || 'Shared item imported successfully.',
      });
      handleCloseReceive();
    } catch (error) {
      console.error('Failed to import shared item:', error);
      showNotification({
        type: 'error',
        message: t('share.error.import') || 'Failed to import shared item.',
      });
    }
  };

  useEffect(() => {
    const checkHashShare = async () => {
      if (window.location.hash.startsWith('#share=')) {
        const payload = await decryptShareUrl(window.location.hash);
        if (payload) {
          setReceivedPayload(payload);
          setIsReceiveOpen(true);
        } else {
          showNotification({
            type: 'error',
            message: t('share.error.decrypt') || 'Failed to decrypt share link.',
          });
          window.history.replaceState(null, '', window.location.pathname);
        }
      }
    };

    void checkHashShare();

    const handleHashChange = () => {
      void checkHashShare();
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [t, showNotification]);

  interface LinuxSecurityStatus {
    is_x11?: boolean;
    wayland_active?: boolean;
  }

  useEffect(() => {
    if (unlocked && typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
      invoke<LinuxSecurityStatus>('get_linux_security_status')
        .then((status) => {
          if (status && status.is_x11) {
            showNotification({
              title: t('security.x11WarningTitle'),
              message: t('security.x11WarningMessage'),
              type: 'warning',
            });
          }
        })
        .catch((err) => {
          console.error('Failed to query Linux security status:', err);
        });
    }
  }, [unlocked, showNotification, t]);

  useEffect(() => {
    if (!unlocked) {
      clearExtensionCredentials();
      return;
    }

    syncExtensionCredentials(items);
    const interval = window.setInterval(() => {
      syncExtensionCredentials(items);
    }, 60_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [unlocked, items]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    listen<any>('add-credential-from-extension', (event) => {
      const payload = event.payload;
      if (payload) {
        handleTriggerNew({
          title: payload.title || '',
          username: payload.username || '',
          password: payload.password || '',
          url: payload.url || '',
          category: 'login',
        });
      }
    }).then((unlisten) => {
      unlistenFn = unlisten;
    }).catch(err => {
      console.error('Failed to listen to tauri add-credential event:', err);
    });

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, [handleTriggerNew]);

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

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [activeSmartFolderId, setActiveSmartFolderId] = useState<string | null>(null);

  const { tags, createTag, updateTag, deleteTag } = useTagLibrary();
  const { folders, createFolder, updateFolder, deleteFolder } = useVaultFolders();
  const { smartFolders, createSmartFolder, deleteSmartFolder, counts: smartFolderCounts } = useSmartFolders(items);
  const bulkSelection = useBulkSelection();

  const handleCreateFolder = (parentId: string | null) => {
    const name = window.prompt(t('folders.createPrompt') || 'New folder name:');
    if (name && name.trim()) {
      createFolder({ name: name.trim(), parentId });
    }
  };

  const handleDeleteFolder = (folderId: string) => {
    if (window.confirm(t('confirm.defaultConfirm') || 'Are you sure?')) {
      deleteFolder(folderId);
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
    }
  };

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

  const handleUpdateItemCategory = async (itemId: string, newCategory: any) => {
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!unlocked) return;

      const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac');
      const modifier = isMac ? e.metaKey : e.ctrlKey;

      if (modifier) {
        const key = e.key.toLowerCase();
        if (key === 'k') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('aegis-focus-search'));
        } else if (key === 'n') {
          e.preventDefault();
          handleTriggerNew();
        } else if (key === 'l') {
          e.preventDefault();
          handleLock();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [unlocked, handleTriggerNew, handleLock]);

  return (
    <div className="safe-screen-fixed flex w-full bg-brand-bg text-on-surface overflow-hidden font-sans">
      <MobileSidebarBackdrop isOpen={isSidebarOpen} onClose={handleCloseSidebar} />

      <SidebarNavigation
        activeTab={activeTab}
        isOpen={isSidebarOpen}
        trashCount={trashItems.length}
        onTabChange={handleTabChange}
        onLock={handleLock}
      />

      <main className="lg:ml-[280px] ml-0 flex-1 flex flex-col min-h-0 bg-brand-bg">
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

      <FloatingVaultAction onNewItem={handleTriggerNew} />

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
  );
}
