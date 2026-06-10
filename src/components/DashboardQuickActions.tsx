import { Plus, Shield, Sparkles } from 'lucide-react';

interface DashboardQuickActionsProps {
  onNewItem: () => void;
  onOpenAudit: () => void;
  onOpenGenerator: () => void;
}

export default function DashboardQuickActions({ onNewItem, onOpenAudit, onOpenGenerator }: DashboardQuickActionsProps) {
  return (
    <div className="space-y-3">
      <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#059669]">HIZLI ERİŞİM VE ARAÇLAR</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={onNewItem}
          className="p-5 bg-surface-container/40 hover:bg-brand-primary/5 hover:border-brand-primary/20 border border-outline-variant/15 rounded-2xl flex flex-col gap-3 transition-all text-left group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-xs text-on-surface">Yeni Şifre Ekle</h4>
            <p className="text-[10px] text-on-surface-variant font-display">Öğeleri kategorize ederek kasaya kaydedin.</p>
          </div>
        </button>

        <button
          onClick={onOpenAudit}
          className="p-5 bg-surface-container/40 hover:bg-brand-secondary/5 hover:border-brand-secondary/20 border border-outline-variant/15 rounded-2xl flex flex-col gap-3 transition-all text-left group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-secondary/15 border border-brand-secondary/10 flex items-center justify-center text-brand-secondary group-hover:scale-110 transition-transform">
            <Shield className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-xs text-on-surface">Güvenlik Denetle</h4>
            <p className="text-[10px] text-on-surface-variant">Tüm hesaplarınızdaki şifreleri tek tıkla tarayın.</p>
          </div>
        </button>

        <button
          onClick={onOpenGenerator}
          className="p-5 bg-surface-container/40 hover:bg-brand-tertiary/5 hover:border-brand-tertiary/20 border border-outline-variant/15 rounded-2xl flex flex-col gap-3 transition-all text-left group cursor-pointer animate-fade-in"
        >
          <div className="w-10 h-10 rounded-xl bg-brand-tertiary/15 border border-brand-tertiary/10 flex items-center justify-center text-brand-tertiary group-hover:scale-110 transition-transform">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-xs text-on-surface font-display">Güçlü Şifre Üret</h4>
            <p className="text-[10px] text-on-surface-variant">Saniyeler içinde aşılması imkansız şifre yapın.</p>
          </div>
        </button>
      </div>
    </div>
  );
}
