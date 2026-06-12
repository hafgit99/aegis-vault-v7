import { Clock, KeyRound, Lock, Settings, Shield, ShieldCheck, Trash2 } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { APP_NAME } from '../lib/branding';
import { ActiveTab } from '../types';

interface SidebarNavigationProps {
  activeTab: ActiveTab;
  isOpen: boolean;
  trashCount: number;
  onTabChange: (tab: ActiveTab) => void;
  onLock: () => void;
}

function getNavButtonClass(activeTab: ActiveTab, tab: ActiveTab): string {
  return `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all focus:outline-none cursor-pointer ${
    activeTab === tab
      ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
      : 'text-on-surface-variant border-transparent hover:bg-surface-high/80 hover:text-on-surface'
  }`;
}

export default function SidebarNavigation({
  activeTab,
  isOpen,
  trashCount,
  onTabChange,
  onLock,
}: SidebarNavigationProps) {
  const { t } = useLanguage();

  return (
    <aside
      className={`fixed left-0 top-0 h-full w-[280px] bg-surface-lowest border-r border-outline-variant/15 flex flex-col p-4 z-50 transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="mb-7 px-1.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-brand-primary flex items-center justify-center shadow-md">
          <Shield className="w-5 h-5 text-brand-on-primary fill-brand-on-primary" />
        </div>
        <div>
          <h1 className="font-display text-[19px] font-bold text-brand-primary leading-tight">{APP_NAME}</h1>
          <p className="text-[9px] text-on-surface-variant uppercase tracking-widest font-semibold">{t('nav.localFirst')}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        <button
          data-testid="nav-vault-button"
          onClick={() => onTabChange('vault')}
          className={getNavButtonClass(activeTab, 'vault')}
        >
          <Lock className="w-4 h-4" />
          <span>{t('nav.vault')}</span>
        </button>

        <button
          data-testid="nav-audit-button"
          onClick={() => onTabChange('audit')}
          className={getNavButtonClass(activeTab, 'audit')}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>{t('nav.audit')}</span>
        </button>

        <button
          data-testid="nav-generator-button"
          onClick={() => onTabChange('generator')}
          className={getNavButtonClass(activeTab, 'generator')}
        >
          <KeyRound className="w-4 h-4" />
          <span>{t('nav.generator')}</span>
        </button>

        <button
          data-testid="nav-settings-button"
          onClick={() => onTabChange('settings')}
          className={getNavButtonClass(activeTab, 'settings')}
        >
          <Settings className="w-4 h-4" />
          <span>{t('nav.settings')}</span>
        </button>

        <button
          data-testid="nav-trash-button"
          onClick={() => onTabChange('trash')}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm font-semibold transition-all focus:outline-none cursor-pointer ${
            activeTab === 'trash'
              ? 'bg-brand-primary/10 text-brand-primary border-brand-primary/20'
              : 'text-on-surface-variant border-transparent hover:bg-surface-high/80 hover:text-on-surface'
          }`}
        >
          <div className="flex items-center gap-3">
            <Trash2 className="w-4 h-4" />
            <span>{t('nav.trash')}</span>
          </div>
          {trashCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/20 text-red-400 font-mono font-bold">
              {trashCount}
            </span>
          )}
        </button>
      </nav>

      <div className="mt-auto pt-4 border-t border-outline-variant/10">
        <div className="space-y-1 mb-4">
          <div className="flex items-center justify-between px-3 py-2 text-on-surface-variant text-xs surface-card rounded-lg">
            <div className="flex items-center gap-2.5">
              <Clock className="w-4 h-4" />
              <span>{t('nav.systemHealth')}</span>
            </div>
            <div className="w-2 h-2 rounded-full bg-brand-tertiary security-pulse"></div>
          </div>
        </div>
        <button
          data-testid="lock-vault-button"
          onClick={onLock}
          className="w-full flex items-center justify-center gap-2 bg-surface-low border border-outline-variant/20 text-on-surface py-3 rounded-lg font-bold text-xs hover:bg-surface-high transition-all cursor-pointer"
        >
          <Lock className="w-4 h-4" />
          <span>{t('nav.lockVault')}</span>
        </button>
      </div>
    </aside>
  );
}
