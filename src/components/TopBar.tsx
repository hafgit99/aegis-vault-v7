import { useState, useRef, useEffect } from 'react';

import { Bell, Lock, Menu, RefreshCw, Search } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { avatarClassNameForValue } from '../lib/avatarStyles';
import { APP_PROFILE_ALT } from '../lib/branding';
import { ActiveTab } from '../types';
import LocalStorageBadge from './LocalStorageBadge';
import { isGradient } from './ProfileModal';

interface TopBarProps {
  activeTab: ActiveTab;
  searchQuery: string;
  profileName: string;
  profileAvatar: string;
  onSearchChange: (value: string) => void;
  onOpenSidebar: () => void;
  onRefresh: () => void | Promise<void>;
  onOpenVaultStatus: () => void;
  onOpenProfile: () => void;
  onLock: () => void;
}

export default function TopBar({
  activeTab,
  searchQuery,
  profileName,
  profileAvatar,
  onSearchChange,
  onOpenSidebar,
  onRefresh,
  onOpenVaultStatus,
  onOpenProfile,
  onLock,
}: TopBarProps) {
  const { t } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleFocusSearch = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener('aegis-focus-search', handleFocusSearch);
    return () => window.removeEventListener('aegis-focus-search', handleFocusSearch);
  }, []);

  const handleRefreshClick = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <header className="min-h-[60px] shrink-0 border-b border-outline-variant/15 bg-surface-lowest/85 flex justify-between items-center px-3 sm:px-4 lg:px-6 py-2 z-30">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 lg:flex-none lg:w-1/3">
        <button
          data-testid="topbar-menu-button"
          onClick={onOpenSidebar}
          className="lg:!hidden toolbar-button cursor-pointer shrink-0"
          title={t('top.openMenu')}
        >
          <Menu className="w-5 h-5" />
        </button>
        {activeTab === 'vault' && (
          <div className="relative w-full max-w-md min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] w-4 h-4" />
            <input
              ref={inputRef}
              data-testid="vault-search-input"
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full bg-surface-low border border-outline-variant/15 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary/25 text-on-surface placeholder-on-surface-variant/50 focus:outline-none transition-all"
              placeholder={t('top.searchPlaceholder')}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 lg:gap-4 shrink-0 pl-2">
        <div className="hidden sm:block">
          <LocalStorageBadge />
        </div>

        <div className="flex items-center gap-2 text-on-surface-variant">
          <button
            data-testid="topbar-refresh-button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="toolbar-button focus:outline-none cursor-pointer disabled:cursor-wait disabled:opacity-70"
            title={t('top.refresh')}
          >
            <RefreshCw className={`w-4.5 h-4.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            data-testid="topbar-status-button"
            onClick={onOpenVaultStatus}
            className="toolbar-button focus:outline-none relative cursor-pointer"
            title={t('top.notifications')}
          >
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-error rounded-full"></span>
          </button>
          <button
            data-testid="topbar-lock-button"
            onClick={onLock}
            className="toolbar-button focus:outline-none cursor-pointer text-red-300 hover:text-red-200 hover:bg-red-500/10"
            title={t('nav.lockVault')}
            aria-label={t('nav.lockVault')}
          >
            <Lock className="w-4.5 h-4.5" />
          </button>

          <button
            data-testid="topbar-profile-button"
            onClick={onOpenProfile}
            className="w-9 h-9 rounded-lg overflow-hidden border border-outline-variant/20 cursor-pointer hover:border-brand-primary/40 active:scale-95 transition-all text-left focus:outline-none focus:ring-1 focus:ring-brand-primary/40 flex items-center justify-center shrink-0"
            title={`${profileName} - ${t('top.editProfile')}`}
          >
            {isGradient(profileAvatar) ? (
              <div
                className={`w-full h-full text-white text-[11px] font-bold font-display flex items-center justify-center select-none ${avatarClassNameForValue(profileAvatar)}`}
              >
                {profileName.charAt(0).toUpperCase()}
              </div>
            ) : (
              <img
                alt={APP_PROFILE_ALT}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                src={profileAvatar}
              />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
