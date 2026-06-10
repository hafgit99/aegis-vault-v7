/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Lock,
  Unlock,
  Shield,
  ShieldCheck,
  KeyRound,
  Settings,
  Search,
  Plus,
  RefreshCw,
  Bell,
  Trash2,
  Clock,
  Globe,
  ShieldAlert,
  Menu,
} from 'lucide-react';
import { VaultItem, ActiveTab, AppNotification } from './types';
import { getVaultItems, saveVaultItem, deleteVaultItem, moveToTrash, restoreFromTrash, deletePermanently, emptyTrashComplete } from './lib/storage';
import { getTOTPTimeRemaining } from './lib/otp';
import { calculatePasswordScore } from './lib/security';
import { getAttachmentBlob } from './lib/attachments';
import LockScreen from './components/LockScreen';
import PasswordGenerator from './components/PasswordGenerator';
import SecurityAudit from './components/SecurityAudit';
import SettingsPanel from './components/SettingsPanel';
import VaultFormModal from './components/VaultFormModal';
import ConfirmModal from './components/ConfirmModal';
import ProfileModal, { isGradient } from './components/ProfileModal';
import MobileSidebarBackdrop from './components/MobileSidebarBackdrop';
import LocalStorageBadge from './components/LocalStorageBadge';
import VaultWorkspace from './components/VaultWorkspace';
import TrashWorkspace from './components/TrashWorkspace';
import { useAutoLock } from './hooks/useAutoLock';
import { useClipboardFeedback } from './hooks/useClipboardFeedback';
import { useSensitiveReveal } from './hooks/useSensitiveReveal';
import { useVaultQueries } from './hooks/useVaultQueries';
import { useVaultSelection } from './hooks/useVaultSelection';

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

  // Auto-Lock Duration State (Seconds, defaulting to 5 minutes / 300 seconds)
  const [autoLockDuration, setAutoLockDuration] = useState<number>(() => {
    const saved = localStorage.getItem('auto_lock_duration');
    return saved !== null ? parseInt(saved, 10) : 300;
  });

  const handleAutoLockDurationChange = (duration: number) => {
    localStorage.setItem('auto_lock_duration', duration.toString());
    setAutoLockDuration(duration);
  };

  // Profile settings state
  const [profileName, setProfileName] = useState(() => {
    return localStorage.getItem('profile_name') || 'Aegis Kullanıcısı';
  });
  const [profileAvatar, setProfileAvatar] = useState(() => {
    return localStorage.getItem('profile_avatar') || 'https://lh3.googleusercontent.com/aida-public/AB6AXuCH67zv7w_c2Gt3Yi8tRFwGe5bb7gJZYlMCHpd55hfAikMyKhRLMtmZTlLWl678ehHejkJGx6MqpODYIBZua1auVdcHjT8vVlOiB0MPntKW2JQY4zFA_AzO8WJNfo1LML8kIr6t1YRAjbi4Y6uFpdk-C5fT4KUYAP_OtMbO1qFJoVDdIJ5p6VgH-7vQiiqT51yHfwKBOgGFA1tyoib-DmocRb4Rabo1ZRHBLIDouFbA7votkCi_xxvrHSVHOj11xZHDnTpBaauKm7Ui';
  });
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Custom alert / confirmation state
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'info' | 'success';
    confirmText?: string;
    cancelText?: string;
    isAlert?: boolean;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
  });

  const showNotification = useCallback((notification: AppNotification) => {
    setConfirmConfig({
      isOpen: true,
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      isAlert: true,
      onConfirm: () => {},
    });
  }, []);

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
    setConfirmConfig({
      isOpen: true,
      title: 'Kasa Durumu',
      message: 'Kasa durumu güncel ve tamamen koruma altında. Herhangi bir sızıntı veya zayıf halka tespit edilmedi.',
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
  };

  const handleOpenProfile = () => {
    setIsProfileModalOpen(true);
  };

  const handleCloseProfile = () => {
    setIsProfileModalOpen(false);
  };

  const handleSelectDashboard = () => {
    setSelectedItem(null);
    setMobileActiveView('detail');
  };

  const handleBackToList = () => {
    setMobileActiveView('list');
  };

  const handleCloseConfirm = () => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
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
    setConfirmConfig({
      isOpen: true,
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
    setConfirmConfig({
      isOpen: true,
      title: 'Çöp Kutusunu Boşalt',
      message: 'Çöp kutusundaki TÜM şifreleri tamamen kalıcı olarak silmek istediğinize emin misiniz? Bu işlem asla geri alınamaz!',
      type: 'danger',
      confirmText: 'Sıfırla ve Kalıcı Sil',
      cancelText: 'Vazgeç',
      onConfirm: () => {
        const updated = emptyTrashComplete();
        setItems(updated);
        setConfirmConfig({
          isOpen: true,
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
    setConfirmConfig({
      isOpen: true,
      title: 'Geri Yüklendi',
      message: `"${trashItem.title}" şifre kaydı başarıyla kasaya geri yüklendi!`,
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
  };

  const handleDeleteTrashItemPermanently = (trashItem: VaultItem) => {
    setConfirmConfig({
      isOpen: true,
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

  const handleSaveProfile = (name: string, avatar: string) => {
    localStorage.setItem('profile_name', name);
    localStorage.setItem('profile_avatar', avatar);
    setProfileName(name);
    setProfileAvatar(avatar);
    setConfirmConfig({
      isOpen: true,
      title: 'Profil Güncellendi',
      message: 'Profil resminiz ve adınız başarıyla kaydedildi.',
      type: 'success',
      isAlert: true,
      onConfirm: () => {},
    });
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

      {/* Sidebar navigation */}
      <aside className={`fixed left-0 top-0 h-full w-[280px] bg-surface-lowest border-r border-outline-variant/10 flex flex-col p-4 z-50 transition-transform duration-300 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className="mb-8 px-2 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center shadow-md">
            <Shield className="w-6 h-6 text-brand-on-primary fill-brand-on-primary" />
          </div>
          <div>
            <h1 className="font-display text-[21px] font-bold text-brand-primary leading-tight">AegisVault</h1>
            <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold">Local-First Secure</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1">
          <button
            onClick={() => handleTabChange('vault')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold text-sm transition-all focus:outline-none cursor-pointer ${
              activeTab === 'vault'
                ? 'bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary pl-4'
                : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Kasa (Vault)</span>
          </button>

          <button
            onClick={() => handleTabChange('audit')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold text-sm transition-all focus:outline-none cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary pl-4'
                : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Güvenlik Analizi</span>
          </button>

          <button
            onClick={() => handleTabChange('generator')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold text-sm transition-all focus:outline-none cursor-pointer ${
              activeTab === 'generator'
                ? 'bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary pl-4'
                : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Şifre Üretici</span>
          </button>

          <button
            onClick={() => handleTabChange('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold text-sm transition-all focus:outline-none cursor-pointer ${
              activeTab === 'settings'
                ? 'bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary pl-4'
                : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>Ayarlar</span>
          </button>

          <button
            onClick={() => handleTabChange('trash')}
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg font-bold text-sm transition-all focus:outline-none cursor-pointer ${
              activeTab === 'trash'
                ? 'bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary pl-4'
                : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface'
            }`}
          >
            <div className="flex items-center gap-3">
              <Trash2 className="w-4 h-4" />
              <span>Çöp Kutusu</span>
            </div>
            {trashItems.length > 0 && (
              <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/20 text-red-400 font-mono font-bold">
                {trashItems.length}
              </span>
            )}
          </button>
        </nav>

        {/* Sidebar Footer element */}
        <div className="mt-auto pt-4 border-t border-outline-variant/10">
          <div className="space-y-1 mb-4">
            <div className="flex items-center justify-between px-3 py-2 text-on-surface-variant text-xs">
              <div className="flex items-center gap-2.5">
                <Clock className="w-4 h-4" />
                <span>System Health</span>
              </div>
              <div className="w-2.5 h-2.5 rounded-full bg-brand-tertiary security-pulse"></div>
            </div>
          </div>
          <button
            onClick={handleManualLock}
            className="w-full flex items-center justify-center gap-2 bg-[#1a1c1a] border border-outline-variant/20 text-on-surface py-3 rounded-lg font-bold text-xs hover:bg-[#252825] transition-all cursor-pointer"
          >
            <Lock className="w-4 h-4" />
            <span>Kilitli (Lock Vault)</span>
          </button>
        </div>
      </aside>

      {/* Primary content dashboard area */}
      <main className="lg:ml-[280px] ml-0 flex-1 flex flex-col h-full bg-brand-bg">
        {/* Top bar */}
        <header className="h-[64px] border-b border-outline-variant/10 bg-surface-lowest/60 backdrop-blur-xl flex justify-between items-center px-4 lg:px-8 z-30">
          <div className="flex items-center gap-3 w-1/2 lg:w-1/3">
            <button
              onClick={handleOpenSidebar}
              className="lg:hidden p-2 text-on-surface-variant hover:text-brand-primary hover:bg-surface-high rounded-xl cursor-pointer shrink-0"
              title="Menüyü Aç"
            >
              <Menu className="w-5 h-5" />
            </button>
            {activeTab === 'vault' && (
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] w-4 h-4" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface-high border-none rounded-full pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 text-on-surface placeholder-on-surface-variant/50 focus:outline-none transition-all"
                  placeholder="Vault içinde ara..."
                />
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            <LocalStorageBadge />

            <div className="flex items-center gap-4 text-on-surface-variant">
              <button
                onClick={refreshDatabase}
                className="hover:text-brand-primary transition-colors focus:outline-none p-1.5 rounded-md hover:bg-surface-high cursor-pointer"
                title="Yenile"
              >
                <RefreshCw className="w-4.5 h-4.5" />
              </button>
              <button
                onClick={handleOpenVaultStatus}
                className="hover:text-brand-primary transition-colors focus:outline-none p-1.5 rounded-md hover:bg-surface-high relative cursor-pointer"
                title="Bildirimler"
              >
                <Bell className="w-4.5 h-4.5" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-error rounded-full animate-bounce"></span>
              </button>

              <button
                onClick={handleOpenProfile}
                className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant/20 cursor-pointer hover:border-brand-primary hover:scale-[1.05] active:scale-95 transition-all text-left focus:outline-none focus:ring-1 focus:ring-brand-primary/40 flex items-center justify-center shrink-0"
                title={`${profileName} - Profili Düzenle`}
              >
                {isGradient(profileAvatar) ? (
                  <div
                    style={{ background: profileAvatar }}
                    className="w-full h-full text-white text-[11px] font-bold font-display flex items-center justify-center select-none"
                  >
                    {profileName.charAt(0).toUpperCase()}
                  </div>
                ) : (
                  <img
                    alt="AegisUser Profile"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    src={profileAvatar}
                  />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Tab content renderer */}
        <div className="flex flex-1 overflow-hidden">
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
              onNewItem={handleTriggerNew}
              onOpenProfile={handleOpenProfile}
              onOpenAudit={handleOpenAuditTab}
              onOpenGenerator={handleOpenGeneratorTab}
              onSetFavoritesOnly={setFilterFavoritesOnly}
              onSelectDashboard={handleSelectDashboard}
              onBackToList={handleBackToList}
              onSelectItem={handleSelectItem}
              onToggleFavorite={handleToggleFavorite}
              onEdit={handleTriggerEdit}
              onDelete={handleDeleteItem}
              onToggleReveal={toggleReveal}
              onCopyText={handleCopyText}
              onDownloadAttachment={handleDownloadAttachment}
            />
          )}

          {activeTab === 'audit' && (
            <div className="flex-1 p-8 overflow-y-auto scrollbar-hide">
              <SecurityAudit items={activeItems} onSelectItem={handleAuditSelectItem} />
            </div>
          )}

          {activeTab === 'generator' && (
            <div className="flex-1 p-8 overflow-y-auto scrollbar-hide">
              <PasswordGenerator />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="flex-1 p-8 overflow-y-auto scrollbar-hide">
              <SettingsPanel 
                onDatabaseChanged={refreshDatabase} 
                autoLockDuration={autoLockDuration}
                onAutoLockDurationChange={handleAutoLockDurationChange}
                onNotify={showNotification}
              />
            </div>
          )}

          {activeTab === 'trash' && (
            <TrashWorkspace
              items={trashItems}
              onEmptyTrash={handleEmptyTrash}
              onRestore={handleRestoreTrashItem}
              onDeletePermanently={handleDeleteTrashItemPermanently}
            />
          )}
        </div>
      </main>

      {/* Floating Action Button (FAB) context support for adding a password */}
      {activeTab === 'vault' && !(selectedItem && mobileActiveView === 'detail') && (
        <button
          onClick={handleTriggerNew}
          className="lg:bottom-8 lg:right-8 bottom-6 right-6 fixed w-14 h-14 bg-brand-primary text-brand-on-primary rounded-full shadow-2xl flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95 transition-all group z-40 hover:brightness-110"
          title="Yeni Şifre Ekle"
        >
          <Plus className="w-8 h-8 text-brand-on-primary transition-transform group-hover:rotate-90" />
        </button>
      )}

      {/* Adding/Editing Modal Drawer */}
      <VaultFormModal
        isOpen={isModalOpen}
        onClose={handleCloseVaultForm}
        onSave={handleSaveItem}
        editingItem={editingItem}
        onNotify={showNotification}
      />

      {/* Profile Settings Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={handleCloseProfile}
        currentAvatar={profileAvatar}
        currentName={profileName}
        onSave={handleSaveProfile}
      />

      {/* Premium Confirm Modal */}
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        confirmText={confirmConfig.confirmText}
        cancelText={confirmConfig.cancelText}
        isAlert={confirmConfig.isAlert}
        onConfirm={confirmConfig.onConfirm}
        onCancel={handleCloseConfirm}
      />
    </div>
  );
}
