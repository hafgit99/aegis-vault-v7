import { CreditCard, FileText, KeyRound } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface DashboardCategoryStatsProps {
  loginCount: number;
  cardCount: number;
  secureNoteCount: number;
}

export default function DashboardCategoryStats({ loginCount, cardCount, secureNoteCount }: DashboardCategoryStatsProps) {
  const { t } = useLanguage();

  return (
    <div className="md:col-span-5 flex flex-col gap-3">
      <div className="surface-card surface-card-hover p-4 rounded-xl flex items-center justify-between group">
        <div className="flex items-center gap-3">
          <div className="icon-tile bg-brand-primary/10 text-brand-primary">
            <KeyRound className="w-5 h-5 focus:outline-none" />
          </div>
          <div>
            <p className="font-bold text-xs text-on-surface">{t('dashboard.category.logins.title')}</p>
            <p className="text-[10px] text-on-surface-variant">{t('dashboard.category.logins.description')}</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/10 px-2.5 py-1 rounded-lg">
          {loginCount}
        </span>
      </div>

      <div className="surface-card surface-card-hover p-4 rounded-xl flex items-center justify-between group">
        <div className="flex items-center gap-3">
          <div className="icon-tile bg-brand-secondary/15 text-brand-secondary">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-xs text-on-surface">{t('dashboard.category.cards.title')}</p>
            <p className="text-[10px] text-on-surface-variant">{t('dashboard.category.cards.description')}</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/10 px-2.5 py-1 rounded-lg">
          {cardCount}
        </span>
      </div>

      <div className="surface-card surface-card-hover p-4 rounded-xl flex items-center justify-between group">
        <div className="flex items-center gap-3">
          <div className="icon-tile bg-brand-tertiary/10 text-brand-tertiary font-display">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="font-bold text-xs text-on-surface">{t('dashboard.category.notes.title')}</p>
            <p className="text-[10px] text-on-surface-variant">{t('dashboard.category.notes.description')}</p>
          </div>
        </div>
        <span className="font-mono text-sm font-bold text-on-surface bg-surface-high border border-outline-variant/10 px-2.5 py-1 rounded-lg">
          {secureNoteCount}
        </span>
      </div>
    </div>
  );
}
