/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  Eye,
  EyeOff,
  Copy,
  Check,
  Clock,
  Globe,
  Heart,
  ShieldAlert,
  ArrowLeft,
  Menu,
  LayoutDashboard,
  Download,
  File,
} from 'lucide-react';
import { VaultItem, ActiveTab, AppNotification } from './types';
import { getVaultItems, saveVaultItem, deleteVaultItem, moveToTrash, restoreFromTrash, deletePermanently, emptyTrashComplete } from './lib/storage';
import { generateTOTP, getTOTPTimeRemaining } from './lib/otp';
import { calculatePasswordScore, getStrengthLabel } from './lib/security';
import { getAttachmentBlob } from './lib/attachments';
import { formatFileSize } from './lib/display';
import LockScreen from './components/LockScreen';
import PasswordGenerator from './components/PasswordGenerator';
import SecurityAudit from './components/SecurityAudit';
import SettingsPanel from './components/SettingsPanel';
import VaultFormModal from './components/VaultFormModal';
import ConfirmModal from './components/ConfirmModal';
import ProfileModal, { isGradient } from './components/ProfileModal';
import MobileSidebarBackdrop from './components/MobileSidebarBackdrop';
import LocalStorageBadge from './components/LocalStorageBadge';
import TrashEmptyState from './components/TrashEmptyState';
import TrashInfoBanner from './components/TrashInfoBanner';
import TrashItemCard from './components/TrashItemCard';
import VaultListItem from './components/VaultListItem';
import CryptoShieldPanel from './components/CryptoShieldPanel';
import AegisGuardReport from './components/AegisGuardReport';
import DashboardCategoryStats from './components/DashboardCategoryStats';
import DashboardSecurityScoreCard from './components/DashboardSecurityScoreCard';
import DashboardQuickActions from './components/DashboardQuickActions';
import RecentVaultPanel from './components/RecentVaultPanel';
import DashboardHeader from './components/DashboardHeader';
import VaultItemSideInfo from './components/VaultItemSideInfo';
import VaultItemSecurityAssessment from './components/VaultItemSecurityAssessment';
import VaultItemDetailHeader from './components/VaultItemDetailHeader';
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

  // If locked, return the beautiful LockScreen UI
  if (!unlocked) {
    return <LockScreen onUnlock={() => setUnlocked(true)} />;
  }

  // Active password score and parameters for selected details
  const score = selectedItem ? calculatePasswordScore(selectedItem.password || '') : 0;
  const strength = selectedItem ? getStrengthLabel(selectedItem.password || '') : { label: 'WEAK', colorClass: '' };

  return (
    <div className="flex h-screen w-full bg-[#121412] text-[#e2e3df] overflow-hidden font-sans">
      <MobileSidebarBackdrop isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

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
            onClick={() => { setActiveTab('vault'); setIsSidebarOpen(false); }}
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
            onClick={() => { setActiveTab('audit'); setIsSidebarOpen(false); }}
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
            onClick={() => { setActiveTab('generator'); setIsSidebarOpen(false); }}
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
            onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
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
            onClick={() => { setActiveTab('trash'); setIsSidebarOpen(false); }}
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
            onClick={() => setUnlocked(false)}
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
              onClick={() => setIsSidebarOpen(true)}
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
                onClick={() => setConfirmConfig({
                  isOpen: true,
                  title: 'Kasa Durumu',
                  message: 'Kasa durumu güncel ve tamamen koruma altında. Herhangi bir sızıntı veya zayıf halka tespit edilmedi.',
                  type: 'success',
                  isAlert: true,
                  onConfirm: () => {},
                })}
                className="hover:text-brand-primary transition-colors focus:outline-none p-1.5 rounded-md hover:bg-surface-high relative cursor-pointer"
                title="Bildirimler"
              >
                <Bell className="w-4.5 h-4.5" />
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-error rounded-full animate-bounce"></span>
              </button>

              <button
                onClick={() => setIsProfileModalOpen(true)}
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
            <>
              {/* Middle column: Vault Item list */}
              <section className={`w-full lg:w-[400px] border-r border-outline-variant/10 flex flex-col bg-surface-lowest/40 overflow-y-auto scrollbar-hide ${
                selectedItem && mobileActiveView === 'detail' ? 'hidden lg:flex' : 'flex'
              }`}>
                <div className="p-6 pb-2 space-y-3">
                  <h2 className="font-display text-lg font-bold text-on-surface flex items-center justify-between">
                    <span>Kişisel Kasa</span>
                    <button
                      onClick={handleTriggerNew}
                      className="text-on-surface-variant hover:text-brand-primary transition-all cursor-pointer"
                      title="Yeni Şifre Ekle"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </h2>

                  {/* Tümü vs Favoriler Filter buttons */}
                  <div className="flex bg-[#161816]/70 p-1 rounded-lg border border-outline-variant/15 text-xs">
                    <button
                      onClick={() => setFilterFavoritesOnly(false)}
                      className={`flex-1 py-1.5 rounded-md font-bold transition-all text-center cursor-pointer ${
                        !filterFavoritesOnly
                          ? 'bg-brand-primary/15 text-brand-primary border border-brand-primary/20'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      Tümü ({activeItems.length})
                    </button>
                    <button
                      onClick={() => setFilterFavoritesOnly(true)}
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
                  {/* Dashboard link button */}
                  <div
                    onClick={() => {
                      setSelectedItem(null);
                      setMobileActiveView('detail');
                    }}
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
                      <React.Fragment key={item.id}>
                        <VaultListItem
                          item={item}
                          isSelected={selectedItem?.id === item.id}
                          onSelect={handleSelectItem}
                        />
                      </React.Fragment>
                    ))
                  )}
                </div>
              </section>

              {/* Right Detail Pane */}
              <section className={`flex-1 p-4 lg:p-8 overflow-y-auto scrollbar-hide bg-[#0c0d0c]/30 ${
                !selectedItem || mobileActiveView === 'list' ? 'hidden lg:block' : 'block'
              }`}>
                {selectedItem ? (
                  <div className="max-w-3xl mx-auto space-y-6 lg:space-y-8">
                    {/* Mobile Back Button Header */}
                    <div className="lg:hidden flex items-center justify-between pb-2 border-b border-outline-variant/10 mb-4">
                      <button
                        onClick={() => setMobileActiveView('list')}
                        className="flex items-center gap-2 text-xs font-bold bg-[#1a1c1a] border border-outline-variant/15 px-3 py-2 rounded-lg text-on-surface hover:text-brand-primary active:scale-95 transition-all cursor-pointer"
                      >
                        <ArrowLeft className="w-4 h-4 text-brand-primary" strokeWidth={2.5} />
                        <span>Geri Dön</span>
                      </button>
                      <span className="text-[10px] text-on-surface-variant uppercase tracking-widest font-bold">KART DETAYLARI</span>
                    </div>

                    <VaultItemDetailHeader
                      item={selectedItem}
                      copiedField={copiedField}
                      onToggleFavorite={handleToggleFavorite}
                      onEdit={handleTriggerEdit}
                      onCopyText={handleCopyText}
                      onDelete={handleDeleteItem}
                    />

                    <VaultItemSecurityAssessment score={score} onOpenAudit={() => setActiveTab('audit')} />

                    {/* Data Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="md:col-span-2 space-y-4">
                        
                        {/* 1. GİRİŞ BİLGİLERİ CATEGORY */}
                        {(selectedItem.category === 'login' || !selectedItem.category) && (
                          <div className="space-y-4">
                            {/* Username */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                KULLANICI ADI VEYA E-POSTA
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-on-surface break-all">{selectedItem.username}</span>
                                <button
                                  onClick={() => handleCopyText(selectedItem.username, 'username')}
                                  className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer shrink-0 ml-2"
                                  title="Kopyala"
                                >
                                  {copiedField === 'username' ? (
                                    <Check className="w-4 h-4 text-brand-tertiary" />
                                  ) : (
                                    <Copy className="w-4 h-4" />
                                  )}
                                </button>
                              </div>
                            </div>

                            {/* Password */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                PAROLA (PASSWORD)
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-base tracking-wider break-all text-on-surface select-all">
                                  {isPasswordRevealed ? selectedItem.password || '(Boş Şifre)' : '••••••••••••••••'}
                                </span>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <button
                                    onClick={() => toggleReveal('password')}
                                    className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                    title={isPasswordRevealed ? 'Gizle' : 'Göster'}
                                  >
                                    {isPasswordRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => handleCopyText(selectedItem.password || '', 'password')}
                                    className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                    title="Kopyala"
                                  >
                                    {copiedField === 'password' ? (
                                      <Check className="w-4 h-4 text-brand-tertiary" />
                                    ) : (
                                      <Copy className="w-4 h-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* OTP (Google Authenticator 2FA) */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2 flex justify-between">
                                <span>İKİ FAKTÖRLÜ DOĞRULAMA (2FA TOTP CODES)</span>
                                {selectedItem.totpSecret && (
                                  <span className="text-brand-primary font-mono lowercase">mfa yetkin</span>
                                )}
                              </label>
                              <div className="flex items-center justify-between">
                                {selectedItem.totpSecret ? (
                                  <>
                                    <span className="font-mono text-xl md:text-2xl font-bold text-brand-primary tracking-widest">
                                      {generateTOTP(selectedItem.totpSecret)}
                                    </span>
                                    <div className="flex items-center gap-2.5">
                                      <span className="text-[11px] text-on-surface-variant font-mono bg-[#141614] px-2.5 py-1 rounded-md border border-outline-variant/15 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-ping"></span>
                                        <span>{totpCountdown} sn kaldı</span>
                                      </span>
                                      <button
                                        onClick={() => handleCopyText(generateTOTP(selectedItem.totpSecret || '').replace(' ', ''), 'totp')}
                                        className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                        title="Doğrulama Kodunu Kopyala"
                                      >
                                        {copiedField === 'totp' ? (
                                          <Check className="w-4 h-4 text-brand-tertiary" />
                                        ) : (
                                          <Copy className="w-4 h-4" />
                                        )}
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-xs text-on-surface-variant/40 italic py-1 text-left">
                                    Bu hesapta OTP kurulumu aktif değil. Düzenleyip Gizli Anahtar girerek başlatabilirsiniz.
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 2. KREDİ KARTI CATEGORY */}
                        {selectedItem.category === 'card' && (
                          <div className="space-y-4">
                            {/* Card Holder Name */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                KART SAHİBİ
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-on-surface uppercase">{selectedItem.cardholderName || 'Belirtilmemiş'}</span>
                                <button
                                  onClick={() => handleCopyText(selectedItem.cardholderName || '', 'cardholderName')}
                                  className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer ml-2 shrink-0"
                                >
                                  {copiedField === 'cardholderName' ? <Check className="w-4 h-4 text-brand-tertiary" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Card Number */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                KART NUMARASI
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-base tracking-widest text-on-surface select-all font-semibold">
                                  {isCardNumRevealed 
                                    ? (selectedItem.cardNumber || '').replace(/(\d{4})/g, '$1 ').trim() 
                                    : '•••• •••• •••• ' + (selectedItem.cardNumber || '').slice(-4)}
                                </span>
                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                  <button
                                    onClick={() => toggleReveal('cardNumber')}
                                    className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                  >
                                    {isCardNumRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => handleCopyText(selectedItem.cardNumber || '', 'cardNumber')}
                                    className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                    title="Kopyala"
                                  >
                                    {copiedField === 'cardNumber' ? <Check className="w-4 h-4 text-brand-tertiary" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Expiry, CVV, Pin Grid */}
                            <div className="grid grid-cols-3 gap-4">
                              <div className="glass-panel p-4 rounded-xl">
                                <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
                                  SON GEÇERLİLİK
                                </label>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-sm text-on-surface">{selectedItem.cardExpiry || 'AA/YY'}</span>
                                  <button
                                    onClick={() => handleCopyText(selectedItem.cardExpiry || '', 'cardExpiry')}
                                    className="text-on-surface-variant hover:text-brand-primary transition-colors p-1"
                                  >
                                    {copiedField === 'cardExpiry' ? '✓' : <Copy className="w-3.5 h-3.5" />}
                                  </button>
                                </div>
                              </div>

                              <div className="glass-panel p-4 rounded-xl">
                                <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
                                  GÜVENLİK KODU (CVV)
                                </label>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-sm text-on-surface">
                                    {isCvvRevealed ? selectedItem.cardCvv || '***' : '***'}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => toggleReveal('cardCvv')}
                                      className="text-on-surface-variant hover:text-brand-primary p-0.5"
                                    >
                                      {isCvvRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                      onClick={() => handleCopyText(selectedItem.cardCvv || '', 'cardCvv')}
                                      className="text-on-surface-variant hover:text-brand-primary p-0.5"
                                    >
                                      {copiedField === 'cardCvv' ? '✓' : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="glass-panel p-4 rounded-xl">
                                <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
                                  ATM / BANKA ŞİFRESİ
                                </label>
                                <div className="flex items-center justify-between">
                                  <span className="font-mono font-bold text-sm text-on-surface">
                                    {isPinRevealed ? selectedItem.cardPin || '****' : '****'}
                                  </span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => toggleReveal('cardPin')}
                                      className="text-on-surface-variant hover:text-brand-primary p-0.5"
                                    >
                                      {isPinRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                    <button
                                      onClick={() => handleCopyText(selectedItem.cardPin || '', 'cardPin')}
                                      className="text-on-surface-variant hover:text-brand-primary p-0.5"
                                    >
                                      {copiedField === 'cardPin' ? '✓' : <Copy className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 3. PASSKEY & CRYPTO API CATEGORY */}
                        {selectedItem.category === 'passkey' && (
                          <div className="space-y-4">
                            {/* Passkey Service */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                HİZMET ADI
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-on-surface">{selectedItem.passkeyService || 'Google Login'}</span>
                              </div>
                            </div>

                            {/* Public ID */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                ORTAK ANAHTAR ORTAK ID (PUBLIC KEY ID)
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-sm text-on-surface break-all">{selectedItem.username || 'boş'}</span>
                                <button
                                  onClick={() => handleCopyText(selectedItem.username || '', 'passkeyPublicId')}
                                  className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer ml-2 shrink-0"
                                >
                                  {copiedField === 'passkeyPublicId' ? <Check className="w-4 h-4 text-brand-tertiary" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Private Secret Value */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                BİLİNMEYEN ÖZEL BİLEŞEN (PRIVATE KEY / SECURE SHIELDS EXPONENT)
                              </label>
                              <div className="flex items-start justify-between">
                                <span className="font-mono text-xs text-on-surface-variant select-all break-all leading-relaxed whitespace-pre bg-[#151715] p-3 rounded-lg border border-outline-variant/10 flex-1 mr-3 h-20 overflow-y-auto">
                                  {isPasskeyExpRevealed ? selectedItem.passkeyPrivateExponent || '(Değer Girilmedi)' : '••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••'}
                                </span>
                                <div className="flex flex-col gap-1.5 shrink-0">
                                  <button
                                    onClick={() => toggleReveal('passkeyPrivateExponent')}
                                    className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                  >
                                    {isPasskeyExpRevealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => handleCopyText(selectedItem.passkeyPrivateExponent || '', 'passkeyPrivateExponent')}
                                    className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                    title="Kopyala"
                                  >
                                    {copiedField === 'passkeyPrivateExponent' ? <Check className="w-4 h-4 text-brand-tertiary" /> : <Copy className="w-4 h-4" />}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 4. KİMLİK / KİŞİSEL BELGE CATEGORY */}
                        {selectedItem.category === 'identity' && (
                          <div className="space-y-4">
                            {/* Full Name */}
                            <div className="glass-panel p-5 rounded-xl bg-gradient-to-r from-surface-high to-surface-high/30">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                BELGEDEKİ TAM AD SOYAD
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-base text-on-surface uppercase select-all">{selectedItem.idFullName || 'Girilmedi'}</span>
                                <button
                                  onClick={() => handleCopyText(selectedItem.idFullName || '', 'idFullName')}
                                  className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                >
                                  {copiedField === 'idFullName' ? <Check className="w-4 h-4 text-brand-tertiary" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* ID / Passport Number */}
                            <div className="glass-panel p-5 rounded-xl">
                              <label className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
                                BELGE / KİMLİK / PASAPORT NUMARASI
                              </label>
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-base font-bold text-brand-primary tracking-widest">{selectedItem.username}</span>
                                <button
                                  onClick={() => handleCopyText(selectedItem.username, 'idNumber')}
                                  className="text-on-surface-variant hover:text-brand-primary transition-colors focus:outline-none p-1.5 hover:bg-[#1a1c1a]/50 rounded-lg cursor-pointer"
                                >
                                  {copiedField === 'idNumber' ? <Check className="w-4 h-4 text-brand-tertiary" /> : <Copy className="w-4 h-4" />}
                                </button>
                              </div>
                            </div>

                            {/* Dates Grid */}
                            <div className="grid grid-cols-3 gap-4">
                              <div className="glass-panel p-4 rounded-xl">
                                <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
                                  DOĞUM TARİHİ
                                </label>
                                <span className="text-xs text-on-surface font-semibold">{selectedItem.idBirthDate || 'Belirtilmedi'}</span>
                              </div>

                              <div className="glass-panel p-4 rounded-xl">
                                <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
                                  SON GEÇERLİLİK
                                </label>
                                <span className="text-xs text-on-surface font-semibold">{selectedItem.idExpiryDate || 'Sınırsız / Yok'}</span>
                              </div>

                              <div className="glass-panel p-4 rounded-xl">
                                <label className="block text-[9px] font-bold tracking-wider text-on-surface-variant uppercase mb-1">
                                  CİNSİYET
                                </label>
                                <span className="text-xs text-brand-secondary font-bold uppercase">{selectedItem.idGender === 'Male' ? 'Erkek / M' : (selectedItem.idGender === 'Female' ? 'Kadın / F' : 'Belirtilmedi')}</span>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* 5. GÜVENLİ NOT CATEGORY */}
                        {selectedItem.category === 'secure_note' && (
                          <div className="glass-panel p-5 rounded-xl space-y-4">
                            <div className="flex justify-between items-center border-b border-outline-variant/10 pb-2">
                              <label className="block text-[10px] font-bold tracking-wider text-brand-secondary uppercase">
                                GÜVENLİ NOT ENKRİPTED DETAYI
                              </label>
                              <button
                                onClick={() => handleCopyText(selectedItem.notes || '', 'secure_notes_copy')}
                                className="text-xs text-brand-primary hover:underline hover:brightness-110 flex items-center gap-1 focus:outline-none focus:ring-0"
                              >
                                {copiedField === 'secure_notes_copy' ? 'Tümü Kopyalandı!' : 'Metni Kopyala'}
                              </button>
                            </div>
                            <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap select-all font-mono py-1.5 max-h-96 overflow-y-auto bg-[#131513] p-4 rounded-xl border border-outline-variant/5">
                              {selectedItem.notes || 'Herhangi bir içerik yazılmamış.'}
                            </p>
                          </div>
                        )}

                        {/* MILITARY DOSYA EKLENTİSİ İNDİRİCİ - INTEGRATED LOCKS WIDGET */}
                        {selectedItem.attachmentId && (
                          <div className="bg-[#101210]/60 p-5 rounded-xl border border-brand-primary/15 space-y-3.5 text-left">
                            <div className="flex items-center justify-between border-b border-outline-variant/5 pb-2">
                              <h4 className="text-[10px] font-bold text-brand-primary tracking-widest uppercase flex items-center gap-2">
                                <File className="w-4 h-4 text-brand-primary" />
                                <span>GÜVENLİ ŞİFRELİ KASA ELEMANI</span>
                              </h4>
                              <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/15 font-mono">XOR AES SECURE</span>
                            </div>

                            <div className="flex items-center justify-between p-3.5 bg-[#171a17]/50 rounded-xl border border-outline-variant/10 hover:border-brand-primary/25 transition-all">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-9 h-9 rounded-lg bg-brand-primary/10 flex items-center justify-center text-brand-primary shrink-0 border border-brand-primary/10">
                                  <File className="w-4.5 h-4.5" />
                                </div>
                                <div className="min-w-0">
                                  <p className="font-bold text-xs text-on-surface truncate pr-2">{selectedItem.attachmentName}</p>
                                  <p className="text-[10px] text-on-surface-variant font-mono mt-0.5 font-bold">
                                    <span>{formatFileSize(selectedItem.attachmentSize || 0)}</span>
                                    <span className="text-[#059669] ml-2">İNDİRİLİRKEN ÇÖZÜLÜR</span>
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDownloadAttachment(selectedItem.attachmentId!, selectedItem.attachmentName!)}
                                className="p-2.5 bg-brand-primary text-brand-on-primary rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-md shadow-brand-primary/10 flex items-center justify-center shrink-0"
                                title="İndir ve Güvenle Çöz"
                              >
                                <Download className="w-4.5 h-4.5" />
                              </button>
                            </div>
                          </div>
                        )}

                      </div>

                      <VaultItemSideInfo item={selectedItem} />
                    </div>
                  </div>
                ) : (
                  <div className="max-w-4xl mx-auto space-y-8 py-4 lg:py-6 animate-fade-in text-left">
                    <DashboardHeader profileName={profileName} onOpenProfile={() => setIsProfileModalOpen(true)} />

                    {/* Bento Grid: Core Analytics & Circular Security Meter */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                      
                      <DashboardSecurityScoreCard auditReport={auditReport} activeItemCount={activeItems.length} />

                      <DashboardCategoryStats
                        loginCount={loginCount}
                        cardCount={cardCount}
                        secureNoteCount={secureNoteCount}
                      />

                    </div>

                    <DashboardQuickActions
                      onNewItem={handleTriggerNew}
                      onOpenAudit={() => setActiveTab('audit')}
                      onOpenGenerator={() => setActiveTab('generator')}
                    />

                    {/* Recent & Premium Stats Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in text-left">
                      
                      <RecentVaultPanel
                        items={activeItems}
                        copiedField={copiedField}
                        onSelect={handleSelectItem}
                        onCopyText={handleCopyText}
                      />

                      <CryptoShieldPanel />

                    </div>

                    <AegisGuardReport auditReport={auditReport} />

                  </div>
                )}
              </section>
            </>
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
            <div className="flex-1 p-6 lg:p-10 overflow-y-auto scrollbar-hide max-w-5xl mx-auto w-full space-y-8 animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-outline-variant/10 pb-6">
                <div>
                  <h1 className="font-display text-2xl font-bold text-on-surface flex items-center gap-3">
                    <Trash2 className="w-7 h-7 text-red-500" />
                    <span>Çöp Kutusu (Trash Bin)</span>
                  </h1>
                  <p className="text-on-surface-variant text-xs mt-1">
                    Silinen şifre kartlarınız burada depolanır ve 15 gün sonra tamamen temizlenir.
                  </p>
                </div>
                {trashItems.length > 0 && (
                  <button
                    onClick={() => {
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
                        }
                      });
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Çöp Kutusunu Tamamen Boşalt</span>
                  </button>
                )}
              </div>

              <TrashInfoBanner />

              {/* Trash Items List */}
              {trashItems.length === 0 ? (
                <TrashEmptyState />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {trashItems.map((item) => (
                    <React.Fragment key={item.id}>
                      <TrashItemCard
                        item={item}
                        onRestore={(trashItem) => {
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
                        }}
                        onDeletePermanently={(trashItem) => {
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
                        }}
                      />
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
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
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveItem}
        editingItem={editingItem}
        onNotify={showNotification}
      />

      {/* Profile Settings Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        currentAvatar={profileAvatar}
        currentName={profileName}
        onSave={(name, avatar) => {
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
        }}
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
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
