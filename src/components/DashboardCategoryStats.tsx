import { CreditCard, FileText, KeyRound } from 'lucide-react';

interface DashboardCategoryStatsProps {
  loginCount: number;
  cardCount: number;
  secureNoteCount: number;
}

export default function DashboardCategoryStats({ loginCount, cardCount, secureNoteCount }: DashboardCategoryStatsProps) {
  return (
    <div className="md:col-span-5 flex flex-col gap-4">
      <div className="bg-surface-container/60 hover:bg-surface-container border border-outline-variant/15 hover:border-brand-primary/10 p-4 rounded-xl flex items-center justify-between transition-all group">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-primary/10 border border-brand-primary/10 flex items-center justify-center text-brand-primary">
            <KeyRound className="w-5 h-5 focus:outline-none" />
          </div>
          <div>
            <p className="font-bold text-xs text-on-surface">Hesap Parolaları</p>
            <p className="text-[10px] text-on-surface-variant">E-posta ve web oturumları</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/10 px-2.5 py-1 rounded-lg">
          {loginCount}
        </span>
      </div>

      <div className="bg-surface-container/60 hover:bg-surface-container border border-outline-variant/15 hover:border-brand-primary/10 p-4 rounded-xl flex items-center justify-between transition-all group">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-secondary/15 border border-brand-secondary/10 flex items-center justify-center text-brand-secondary">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-xs text-on-surface">Ödeme Kartları</p>
            <p className="text-[10px] text-on-surface-variant">Kredi ve banka kartları</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/10 px-2.5 py-1 rounded-lg">
          {cardCount}
        </span>
      </div>

      <div className="bg-surface-container/60 hover:bg-surface-container border border-outline-variant/15 hover:border-brand-primary/10 p-4 rounded-xl flex items-center justify-between transition-all group">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-tertiary/10 border border-brand-tertiary/10 flex items-center justify-center text-brand-tertiary font-display">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-xs text-on-surface">Güvenli Notlar</p>
            <p className="text-[10px] text-on-surface-variant">Lisanslar ve gizli notlar</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/10 px-2.5 py-1 rounded-lg">
          {secureNoteCount}
        </span>
      </div>
    </div>
  );
}
