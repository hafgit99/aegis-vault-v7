/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import LockScreen from './components/LockScreen';
import MobileSidebarBackdrop from './components/MobileSidebarBackdrop';
import SidebarNavigation from './components/SidebarNavigation';
import TopBar from './components/TopBar';
import MainContent from './components/MainContent';
import FloatingVaultAction from './components/FloatingVaultAction';
import { Check } from 'lucide-react';
import AppModals from './components/AppModals';
import { useClipboardFeedback } from './hooks/useClipboardFeedback';
import { useSensitiveReveal } from './hooks/useSensitiveReveal';
import { useVaultQueries } from './hooks/useVaultQueries';
import { useVaultSelection } from './hooks/useVaultSelection';
import { useProfileSettings } from './hooks/useProfileSettings';
import { useAutoLockDuration } from './hooks/useAutoLockDuration';
import { useConfirmModal } from './hooks/useConfirmModal';
import { useTotpCountdown } from './hooks/useTotpCountdown';
import { useVaultData } from './hooks/useVaultData';
import { useAttachmentDownload } from './hooks/useAttachmentDownload';
import { useTrashActions } from './hooks/useTrashActions';
import { useAppNavigation } from './hooks/useAppNavigation';
import { useVaultFormState } from './hooks/useVaultFormState';
import { useVaultMobileView } from './hooks/useVaultMobileView';
import { useVaultLock } from './hooks/useVaultLock';
import { useVaultFilters } from './hooks/useVaultFilters';
import { useUnlockedVaultRefresh } from './hooks/useUnlockedVaultRefresh';
import { useSelectedItemScore } from './hooks/useSelectedItemScore';
import { useVaultStatusAction } from './hooks/useVaultStatusAction';
import { useRuntimeSecurity } from './hooks/useRuntimeSecurity';
import { useLanguage } from './i18n/LanguageContext';
import {
  AndroidAutofillRequest,
  clearPendingAndroidAutofillRequest,
  getPendingAndroidAutofillRequest,
  subscribeAndroidAutofillRequests,
} from './lib/androidAutofill';
import { syncExtensionCredentials, clearExtensionCredentials } from './lib/desktopStorage';

export default function App() {
  const { t } = useLanguage();
  const [pendingAutofillRequest, setPendingAutofillRequest] = useState<AndroidAutofillRequest | null>(() =>
    getPendingAndroidAutofillRequest(),
  );
  const notifiedAutofillRequestRef = useRef<string | null>(null);
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
    toggleFavorite: handleToggleFavorite,
  } = useVaultData();

  const {
    mobileActiveView,
    setMobileActiveView,
    selectDashboard: handleSelectDashboard,
    backToList: handleBackToList,
  } = useVaultMobileView({ setSelectedItem });

  const {
    autoLockDuration,
    changeAutoLockDuration: handleAutoLockDurationChange,
  } = useAutoLockDuration();

  const {
    searchQuery,
    setSearchQuery,
    filterFavoritesOnly,
    setFilterFavoritesOnly,
    selectedCategory,
    setSelectedCategory,
  } = useVaultFilters();

  const {
    unlocked,
    unlock: handleUnlock,
    lock: handleLock,
  } = useVaultLock({
    autoLockDuration,
    resetReveals,
    clearCopiedField,
  });

  const { privacyShieldVisible } = useRuntimeSecurity({
    unlocked,
    onLock: handleLock,
    onSensitiveStateClear: () => {
      resetReveals();
      clearCopiedField();
    },
  });

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

  const {
    confirmConfig,
    openConfirm,
    showNotification,
    closeConfirm: handleCloseConfirm,
  } = useConfirmModal();

  useEffect(() => {
    const pending = getPendingAndroidAutofillRequest();
    if (pending) {
      setPendingAutofillRequest(pending);
    }

    return subscribeAndroidAutofillRequests((request) => {
      setPendingAutofillRequest(request);
    });
  }, []);

  useEffect(() => {
    if (!unlocked || !pendingAutofillRequest) return;
    if (notifiedAutofillRequestRef.current === pendingAutofillRequest.requestId) return;

    notifiedAutofillRequestRef.current = pendingAutofillRequest.requestId;
    setActiveTab('vault');
    showNotification({
      title: t('autofill.notification.title'),
      message: t('autofill.notification.message'),
      type: 'info',
    });
  }, [pendingAutofillRequest, setActiveTab, showNotification, t, unlocked]);

  const handleCancelAutofillRequest = useCallback(() => {
    if (pendingAutofillRequest) {
      clearPendingAndroidAutofillRequest(pendingAutofillRequest.requestId);
    }

    notifiedAutofillRequestRef.current = null;
    setPendingAutofillRequest(null);
    showNotification({
      title: t('autofill.cancelled.title'),
      message: t('autofill.cancelled.message'),
      type: 'info',
    });
  }, [pendingAutofillRequest, showNotification, t]);

  const {
    openVaultStatus: handleOpenVaultStatus,
  } = useVaultStatusAction({ openConfirm });

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
    activeItems,
    trashItems,
    filteredItems,
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

  // If locked, return the beautiful LockScreen UI
  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} isAutofillPending={Boolean(pendingAutofillRequest)} />;
  }

  return (
    <div className="safe-screen flex w-full bg-[#121412] text-[#e2e3df] overflow-hidden font-sans">
      <MobileSidebarBackdrop isOpen={isSidebarOpen} onClose={handleCloseSidebar} />

      <SidebarNavigation
        activeTab={activeTab}
        isOpen={isSidebarOpen}
        trashCount={trashItems.length}
        onTabChange={handleTabChange}
        onLock={handleLock}
      />

      {/* Primary content dashboard area */}
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
        />

        <MainContent
          activeTab={activeTab}
          selectedItem={selectedItem}
          mobileActiveView={mobileActiveView}
          filteredItems={filteredItems}
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
          onToggleReveal={toggleReveal}
          onCopyText={handleCopyText}
          onDownloadAttachment={handleDownloadAttachment}
          onDatabaseChanged={refreshDatabase}
          onAutoLockDurationChange={handleAutoLockDurationChange}
          onNotify={showNotification}
          onEmptyTrash={handleEmptyTrash}
          onRestoreTrashItem={handleRestoreTrashItem}
          onDeleteTrashItemPermanently={handleDeleteTrashItemPermanently}
          isAutofillMode={Boolean(pendingAutofillRequest)}
          onCancelAutofill={handleCancelAutofillRequest}
        />
      </main>

      <FloatingVaultAction onNewItem={handleTriggerNew} />

      {privacyShieldVisible && (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-[300] flex items-center justify-center bg-[#080a09] text-[#e2e3df]"
        >
          <div className="text-center px-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md border border-[#84cc16]/40 bg-[#172012]">
              <Check size={24} className="text-[#a3e635]" />
            </div>
            <p className="text-sm font-semibold tracking-[0.18em] uppercase">Aegis Vault</p>
            <p className="mt-2 text-xs text-[#aeb5aa]">Secure display shield active</p>
          </div>
        </div>
      )}

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
      />

      {/* Floating Toast Notification for Copied Fields */}
      {copiedField && (
        <div 
          data-testid="copy-toast-notification"
          className="fixed bottom-6 right-6 z-[110] flex items-center gap-2.5 bg-[#1a1c1a] px-4 py-3 rounded-xl border border-brand-primary/10 shadow-2xl animate-fade-in"
        >
          <div className="w-5 h-5 rounded-full bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary">
            <Check className="w-3 h-3" />
          </div>
          <span className="text-xs font-semibold text-on-surface">
            {t('top.copied')}
          </span>
        </div>
      )}
    </div>
  );
}
