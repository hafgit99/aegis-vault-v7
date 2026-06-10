/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { VaultItem, ActiveTab } from './types';
import { getVaultItems, saveVaultItem, deleteVaultItem, moveToTrash, restoreFromTrash, deletePermanently, emptyTrashComplete } from './lib/storage';
import { getTOTPTimeRemaining } from './lib/otp';
import { calculatePasswordScore } from './lib/security';
import { getAttachmentBlob } from './lib/attachments';
import LockScreen from './components/LockScreen';
import MobileSidebarBackdrop from './components/MobileSidebarBackdrop';
import SidebarNavigation from './components/SidebarNavigation';
import TopBar from './components/TopBar';
import MainContent from './components/MainContent';
import FloatingVaultAction from './components/FloatingVaultAction';
import AppModals from './components/AppModals';
import { useAutoLock } from './hooks/useAutoLock';
import { useClipboardFeedback } from './hooks/useClipboardFeedback';
import { useSensitiveReveal } from './hooks/useSensitiveReveal';
import { useVaultQueries } from './hooks/useVaultQueries';
import { useVaultSelection } from './hooks/useVaultSelection';
import { useProfileSettings } from './hooks/useProfileSettings';
import { useAutoLockDuration } from './hooks/useAutoLockDuration';
import { useConfirmModal } from './hooks/useConfirmModal';

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('vault');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState<VaultItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);

  // Responsive & Filter States
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [filterFavoritesOnly, setFilterFavoritesOnly] = useState(false);
  const [mobileActiveView, setMobileActiveView] = useState<'list' | 'detail'>('list');

  // Modal and CRUD States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VaultItem | null>(null);

  const { copiedField, copyText: handleCopyText, clearCopiedField } = useClipboardFeedback();
  const { revealed, toggleReveal, resetReveals } = useSensitiveReveal();
  const isPasswordRevealed = revealed.password;
  const isCardNumRevealed = revealed.cardNumber;
  const isCvvRevealed = revealed.cardCvv;
  const isPinRevealed = revealed.cardPin;
  const isPasskeyExpRevealed = revealed.passkeyPrivateExponent;

  // Rotating 2FA Countdown
  const [totpCountdown, setTotpCountdown] = useState(30);

  const {
    autoLockDuration,
    changeAutoLockDuration: handleAutoLockDurationChange,
  } = useAutoLockDuration();

  const {
    confirmConfig,
    openConfirm,
    showNotification,
    closeConfirm: handleCloseConfirm,
  } = useConfirmModal();

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
        title: 'Profil Güncellendi',
        message: 'Profil resminiz ve adınız başarıyla kaydedildi.',
        type: 'success',
      }),
  });

  // Retrieve data on state initialization
  const refreshDatabase = () => {
    const loaded = getVaultItems();
    setItems(loaded);
    
    // Maintain or reset selection with active items only
    const activeLoaded = loaded.filter(x => !x.deleted);
    if (activeLoaded.length > 0) {
      if (selectedItem && !selectedItem.deleted) {
        const stillExists = activeLoaded.find((x) => x.id === selectedItem.id);
        setSelectedItem(stillExists || activeLoaded[0]);
      } else {
        setSelectedItem(activeLoaded[0]);
      }
    } else {
      setSelectedItem(null);
    }
  };

  useEffect(() => {
    if (unlocked) {
      refreshDatabase();
    }
  }, [unlocked]);

  // Handle active 2FA ticking countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setTotpCountdown(getTOTPTimeRemaining());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleAutoLock = useCallback(() => {
    setUnlocked(false);
    resetReveals();
    clearCopiedField();
  }, [clearCopiedField, resetReveals]);

  const handleUnlock = () => {
    setUnlocked(true);
  };

  const handleManualLock = () => {
    setUnlocked(false);
  };

  const handleOpenSidebar = () => {
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  useAutoLock({
    unlocked,
    durationSeconds: autoLockDuration,
    onLock: handleAutoLock,
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

  const handleTabChange = (tab: ActiveTab) => {
    setActiveTab(tab);
    setIsSidebarOpen(false);
  };

  const handleOpenAuditTab = () => {
    handleTabChange('audit');
  };

  const handleOpenGeneratorTab = () => {
    handleTabChange('generator');
  };

  const handleOpenVaultStatus = () => {
    openConfirm({
      title: 'Kasa Durumu',
      message: 'Kasa durumu güncel ve tamamen koruma altında. Herhangi bir sızıntı veya zayıf halka tespit edilmedi.',
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
  };

  const handleSelectDashboard = () => {
    setSelectedItem(null);
    setMobileActiveView('detail');
  };

  const handleBackToList = () => {
    setMobileActiveView('list');
  };

  // Toggle Favorite
  const handleToggleFavorite = (item: VaultItem) => {
    const updatedItem = { ...item, favorite: !item.favorite };
    const updated = saveVaultItem(updatedItem);
    setItems(updated);
    setSelectedItem(updatedItem);
  };

  // Attachment downloading utility
  const handleDownloadAttachment = async (id: string, name: string) => {
    try {
      const res = await getAttachmentBlob(id);
      if (res) {
        const url = URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        showNotification({
          title: 'Dosya Bulunamadı',
          message: 'Seçili dosya yerel kasanızda bulunamadı veya silinmiş.',
          type: 'warning',
        });
      }
    } catch (err) {
      console.error(err);
      showNotification({
        title: 'Dosya Açılamadı',
        message: 'Dosya şifresi çözülürken bir hata ile karşılaşıldı.',
        type: 'danger',
      });
    }
  };

  // Delete handler (moves to trash)
  const handleDeleteItem = (id: string) => {
    openConfirm({
      title: 'Çöp Kutusuna Taşı',
      message: 'Bu şifre kaydını çöp kutusuna taşımak istediğinize emin misiniz? Çöp kutusundaki veriler 15 gün sonra otomatik olarak temizlenecektir.',
      type: 'warning',
      confirmText: 'Çöpe Taşı',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        const updated = moveToTrash(id);
        setItems(updated);
        resetReveals();
        clearCopiedField();
        
        const activeRemaining = updated.filter((item) => !item.deleted);
        if (activeRemaining.length > 0) {
          setSelectedItem(activeRemaining[0]);
        } else {
          setSelectedItem(null);
        }
      }
    });
  };

  const handleEmptyTrash = () => {
    openConfirm({
      title: 'Çöp Kutusunu Boşalt',
      message: 'Çöp kutusundaki TÜM şifreleri tamamen kalıcı olarak silmek istediğinize emin misiniz? Bu işlem asla geri alınamaz!',
      type: 'danger',
      confirmText: 'Sıfırla ve Kalıcı Sil',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        const updated = emptyTrashComplete();
        setItems(updated);
        openConfirm({
          title: 'Çöp Kutusu Boşaltıldı',
          message: 'Çöp kutusundaki tüm şifreler kalıcı olarak silindi.',
          type: 'success',
          isAlert: true,
          onConfirm: () => {},
        });
      },
    });
  };

  const handleRestoreTrashItem = (trashItem: VaultItem) => {
    const updated = restoreFromTrash(trashItem.id);
    setItems(updated);
    openConfirm({
      title: 'Geri Yüklendi',
      message: `"${trashItem.title}" şifre kaydı başarıyla kasaya geri yüklendi!`,
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
  };

  const handleDeleteTrashItemPermanently = (trashItem: VaultItem) => {
    openConfirm({
      title: 'Kalıcı Olarak Sil',
      message: `"${trashItem.title}" kaydını tamamen kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri ALINAMAZ.`,
      type: 'danger',
      confirmText: 'Kalıcı Olarak Sil',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        const updated = deletePermanently(trashItem.id);
        setItems(updated);
      },
    });
  };

  // Save handler
  const handleSaveItem = (item: VaultItem) => {
    const updated = saveVaultItem(item);
    setItems(updated);
    // Auto select updated item
    const saved = updated.find((x) => x.title === item.title && x.username === item.username);
    if (saved) {
      setSelectedItem(saved);
    }
  };

  // Trigger Edit Form
  const handleTriggerEdit = () => {
    if (!selectedItem) return;
    setEditingItem(selectedItem);
    setIsModalOpen(true);
  };

  // Trigger New Item
  const handleTriggerNew = () => {
    setEditingItem(null);
    setIsModalOpen(true);
  };

  const handleCloseVaultForm = () => {
    setIsModalOpen(false);
  };

  // If locked, return the beautiful LockScreen UI
  if (!unlocked) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  // Active password score and parameters for selected details
  const score = selectedItem ? calculatePasswordScore(selectedItem.password || '') : 0;

  return (
    <div className="flex h-screen w-full bg-[#121412] text-[#e2e3df] overflow-hidden font-sans">
      <MobileSidebarBackdrop isOpen={isSidebarOpen} onClose={handleCloseSidebar} />

      <SidebarNavigation
        activeTab={activeTab}
        isOpen={isSidebarOpen}
        trashCount={trashItems.length}
        onTabChange={handleTabChange}
        onLock={handleManualLock}
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
          onRefresh={refreshDatabase}
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

      <FloatingVaultAction
        activeTab={activeTab}
        isDetailOpenOnMobile={Boolean(selectedItem && mobileActiveView === 'detail')}
        onNewItem={handleTriggerNew}
      />

      <AppModals
        isVaultFormOpen={isModalOpen}
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
