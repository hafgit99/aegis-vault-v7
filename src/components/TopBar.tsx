import { useState } from 'react';

import { Bell, Menu, RefreshCw, Search } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
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
}: TopBarProps) {
  const { t } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);

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
    <header className="h-[64px] border-b border-outline-variant/10 bg-surface-lowest/60 backdrop-blur-xl flex justify-between items-center px-4 lg:px-8 z-30">
      <div className="flex items-center gap-3 w-1/2 lg:w-1/3">
        <button
          data-testid="topbar-menu-button"
          onClick={onOpenSidebar}
          className="lg:hidden p-2 text-on-surface-variant hover:text-brand-primary hover:bg-surface-high rounded-xl cursor-pointer shrink-0"
          title={t('top.openMenu')}
        >
          <Menu className="w-5 h-5" />
        </button>
        {activeTab === 'vault' && (
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px] w-4 h-4" />
            <input
              data-testid="vault-search-input"
              type="text"
              value={searchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              className="w-full bg-surface-high border-none rounded-full pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-brand-primary/20 text-on-surface placeholder-on-surface-variant/50 focus:outline-none transition-all"
              placeholder={t('top.searchPlaceholder')}
            />
          </div>
        )}
      </div>

      <div className="flex items-center gap-4 lg:gap-6">
        <LocalStorageBadge />

        <div className="flex items-center gap-4 text-on-surface-variant">
          <button
            data-testid="topbar-refresh-button"
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="hover:text-brand-primary transition-colors focus:outline-none p-1.5 rounded-md hover:bg-surface-high cursor-pointer disabled:cursor-wait disabled:opacity-70"
            title={t('top.refresh')}
          >
            <RefreshCw className={`w-4.5 h-4.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            data-testid="topbar-status-button"
            onClick={onOpenVaultStatus}
            className="hover:text-brand-primary transition-colors focus:outline-none p-1.5 rounded-md hover:bg-surface-high relative cursor-pointer"
            title={t('top.notifications')}
          >
            <Bell className="w-4.5 h-4.5" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-brand-error rounded-full animate-bounce"></span>
          </button>

          <button
            data-testid="topbar-profile-button"
            onClick={onOpenProfile}
            className="w-8 h-8 rounded-full overflow-hidden border border-outline-variant/20 cursor-pointer hover:border-brand-primary hover:scale-[1.05] active:scale-95 transition-all text-left focus:outline-none focus:ring-1 focus:ring-brand-primary/40 flex items-center justify-center shrink-0"
            title={`${profileName} - ${t('top.editProfile')}`}
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
