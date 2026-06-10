import { APP_NAME } from '../lib/branding';

interface DashboardHeaderProps {
  profileName: string;
  onOpenProfile: () => void;
}

export default function DashboardHeader({ profileName, onOpenProfile }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/10 pb-6">
      <div className="space-y-1">
        <h2 className="font-display text-2xl lg:text-3xl font-bold text-on-surface flex items-center gap-2.5">
          <span>Kasa Paneli</span>
          <span className="text-brand-primary">{APP_NAME}</span>
        </h2>
        <p className="text-on-surface-variant text-xs">
          Kişisel şifreli kasanızın genel analizini ve güvenlik durumunu buradan izleyin.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs text-on-surface font-semibold">{profileName}</p>
          <p className="text-[10px] text-on-surface-variant">Otomatik Kilit Koruma</p>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary text-sm font-bold font-display select-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-primary/40 hover:scale-[1.05] active:scale-95 transition-all"
        >
          {profileName.charAt(0).toUpperCase()}
        </button>
      </div>
    </div>
  );
}
