import { Plus, Shield, Sparkles } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

interface DashboardQuickActionsProps {
  onNewItem: () => void;
  onOpenAudit: () => void;
  onOpenGenerator: () => void;
}

export default function DashboardQuickActions({ onNewItem, onOpenAudit, onOpenGenerator }: DashboardQuickActionsProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-3">
      <h3 className="font-display text-xs font-bold uppercase tracking-widest text-brand-tertiary">{t('dashboard.quick.title')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button
          onClick={onNewItem}
          className="surface-card surface-card-hover p-4 rounded-xl flex items-center gap-3 text-left group cursor-pointer"
        >
          <div className="icon-tile bg-brand-primary/10 text-brand-primary group-hover:scale-105 transition-transform shrink-0">
            <Plus className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-xs text-on-surface">{t('dashboard.quick.newItem.title')}</h4>
            <p className="text-[10px] text-on-surface-variant font-display">{t('dashboard.quick.newItem.description')}</p>
          </div>
        </button>

        <button
          onClick={onOpenAudit}
          className="surface-card surface-card-hover p-4 rounded-xl flex items-center gap-3 text-left group cursor-pointer"
        >
          <div className="icon-tile bg-brand-secondary/15 text-brand-secondary group-hover:scale-105 transition-transform shrink-0">
            <Shield className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-xs text-on-surface">{t('dashboard.quick.audit.title')}</h4>
            <p className="text-[10px] text-on-surface-variant">{t('dashboard.quick.audit.description')}</p>
          </div>
        </button>

        <button
          onClick={onOpenGenerator}
          className="surface-card surface-card-hover p-4 rounded-xl flex items-center gap-3 text-left group cursor-pointer"
        >
          <div className="icon-tile bg-brand-tertiary/15 text-brand-tertiary group-hover:scale-105 transition-transform shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-0.5">
            <h4 className="font-bold text-xs text-on-surface font-display">{t('dashboard.quick.generator.title')}</h4>
            <p className="text-[10px] text-on-surface-variant">{t('dashboard.quick.generator.description')}</p>
          </div>
        </button>
      </div>
    </div>
  );
}
