import { APP_NAME } from '../lib/branding';
import { useLanguage } from '../i18n/LanguageContext';

interface DashboardHeaderProps {
  profileName: string;
  onOpenProfile: () => void;
}

export default function DashboardHeader({ profileName, onOpenProfile }: DashboardHeaderProps) {
  const { t } = useLanguage();

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 border-b border-outline-variant/10 pb-4 sm:pb-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl sm:text-2xl font-bold text-on-surface flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span>{t('dashboard.title')}</span>
          <span className="text-brand-primary">{APP_NAME}</span>
        </h2>
        <p className="hidden sm:block text-on-surface-variant text-xs">
          {t('dashboard.subtitle')}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-on-surface font-semibold">{profileName}</p>
          <p className="text-[10px] text-on-surface-variant">{t('dashboard.autoLock')}</p>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          className="w-10 h-10 rounded-lg bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary text-sm font-bold font-display select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 active:scale-95 transition-all"
        >
          {profileName.charAt(0).toUpperCase()}
        </button>
      </div>
    </div>
  );
}
