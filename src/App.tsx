/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import LockScreen from './components/LockScreen';
import MobileSidebarBackdrop from './components/MobileSidebarBackdrop';
import SidebarNavigation from './components/SidebarNavigation';
import TopBar from './components/TopBar';
import MainContent from './components/MainContent';
import FloatingVaultAction from './components/FloatingVaultAction';
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
import { useLanguage } from './i18n/LanguageContext';

export default function App() {
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

  const {
    confirmConfig,
    openConfirm,
    showNotification,
    closeConfirm: handleCloseConfirm,
  } = useConfirmModal();

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
    auditReport,
  } = useVaultQueries({
    items,
    searchQuery,
    favoritesOnly: filterFavoritesOnly,
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
    return <LockScreen onUnlock={handleUnlock} />;
  }

  return (
    <div className="flex h-screen w-full bg-[#121412] text-[#e2e3df] overflow-hidden font-sans">
      <MobileSidebarBackdrop isOpen={isSidebarOpen} onClose={handleCloseSidebar} />

      <SidebarNavigation
        activeTab={activeTab}
        isOpen={isSidebarOpen}
        trashCount={trashItems.length}
        onTabChange={handleTabChange}
        onLock={handleLock}
      />

      {/* Primary content dashboard area */}
      <main className="lg:ml-[280px] ml-0 flex-1 flex flex-col h-full bg-brand-bg">
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
          onOpenAudit={handleOpenAuditTab}
          onOpenGenerator={handleOpenGeneratorTab}
          onSetFavoritesOnly={setFilterFavoritesOnly}
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
        />
      </main>

      <FloatingVaultAction onNewItem={handleTriggerNew} />

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
    </div>
  );
}
