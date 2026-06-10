import { Clock, KeyRound, Lock, Settings, Shield, ShieldCheck, Trash2 } from 'lucide-react';

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
  return `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold text-sm transition-all focus:outline-none cursor-pointer ${
    activeTab === tab
      ? 'bg-brand-primary/10 text-brand-primary border-l-2 border-brand-primary pl-4'
      : 'text-on-surface-variant hover:bg-surface-high hover:text-on-surface'
  }`;
}

export default function SidebarNavigation({
  activeTab,
  isOpen,
  trashCount,
  onTabChange,
  onLock,
}: SidebarNavigationProps) {
  return (
    <aside
      className={`fixed left-0 top-0 h-full w-[280px] bg-surface-lowest border-r border-outline-variant/10 flex flex-col p-4 z-50 transition-transform duration-300 ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}
    >
      <div className="mb-8 px-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-brand-primary flex items-center justify-center shadow-md">
          <Shield className="w-6 h-6 text-brand-on-primary fill-brand-on-primary" />
        </div>
        <div>
          <h1 className="font-display text-[21px] font-bold text-brand-primary leading-tight">{APP_NAME}</h1>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold">Local-First Secure</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        <button onClick={() => onTabChange('vault')} className={getNavButtonClass(activeTab, 'vault')}>
          <Lock className="w-4 h-4" />
          <span>Kasa (Vault)</span>
        </button>

        <button onClick={() => onTabChange('audit')} className={getNavButtonClass(activeTab, 'audit')}>
          <ShieldCheck className="w-4 h-4" />
          <span>Güvenlik Analizi</span>
        </button>

        <button onClick={() => onTabChange('generator')} className={getNavButtonClass(activeTab, 'generator')}>
          <KeyRound className="w-4 h-4" />
          <span>Şifre Üretici</span>
        </button>

        <button onClick={() => onTabChange('settings')} className={getNavButtonClass(activeTab, 'settings')}>
          <Settings className="w-4 h-4" />
          <span>Ayarlar</span>
        </button>

        <button
          onClick={() => onTabChange('trash')}
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
          {trashCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-red-500/20 text-red-400 font-mono font-bold">
              {trashCount}
            </span>
          )}
        </button>
      </nav>

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
          onClick={onLock}
          className="w-full flex items-center justify-center gap-2 bg-[#1a1c1a] border border-outline-variant/20 text-on-surface py-3 rounded-lg font-bold text-xs hover:bg-[#252825] transition-all cursor-pointer"
        >
          <Lock className="w-4 h-4" />
          <span>Kilitli (Lock Vault)</span>
        </button>
      </div>
    </aside>
  );
}
