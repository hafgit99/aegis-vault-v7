import { ShieldCheck } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { TranslationKey } from '../i18n/translations';
import { AuditReport } from '../types';

interface DashboardSecurityScoreCardProps {
  auditReport: AuditReport;
  activeItemCount: number;
}

function getScoreTone(score: number): string {
  if (score >= 85) return 'text-brand-tertiary';
  if (score >= 50) return 'text-brand-secondary';
  return 'text-brand-error';
}

function getScoreTitleKey(score: number): TranslationKey {
  if (score >= 85) return 'dashboard.score.secureTitle';
  if (score >= 50) return 'dashboard.score.mediumTitle';
  return 'dashboard.score.criticalTitle';
}

function getScoreDescriptionKey(score: number): TranslationKey {
  return score >= 85 ? 'dashboard.score.secureDescription' : 'dashboard.score.riskyDescription';
}

export default function DashboardSecurityScoreCard({ auditReport, activeItemCount }: DashboardSecurityScoreCardProps) {
  const { t } = useLanguage();

  return (
    <div className="md:col-span-7 surface-panel rounded-xl p-6 flex flex-col justify-between gap-6 relative overflow-hidden group hover:border-brand-primary/15 transition-all">
      <div className="flex items-center justify-between col-span-full">
        <div className="space-y-1">
          <span className="text-[10px] font-bold tracking-widest text-brand-tertiary uppercase flex items-center gap-1.5 bg-brand-tertiary/10 px-2.5 py-1 rounded-md w-fit">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{t('dashboard.score.label')}</span>
          </span>
        </div>
        <span className="text-[10px] text-on-surface-variant font-mono">{t('dashboard.score.crypto')}</span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-6 my-2">
        <div className="relative w-28 h-28 shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-surface-high stroke-current"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeWidth="3.5"
            ></path>
            <path
              className={`${getScoreTone(auditReport.score)} stroke-current`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeDasharray={`${auditReport.score}, 100`}
              strokeLinecap="round"
              strokeWidth="3.5"
            ></path>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center font-display">
            <span className="text-2xl font-bold font-mono text-on-surface">%{auditReport.score}</span>
            <span className="text-[9px] text-on-surface-variant/70 tracking-widest uppercase">{t('dashboard.score.power')}</span>
          </div>
        </div>

        <div className="space-y-2 text-center sm:text-left">
          <h3 className="font-display font-bold text-base text-on-surface">{t(getScoreTitleKey(auditReport.score))}</h3>
          <p className="text-on-surface-variant text-xs leading-relaxed">{t(getScoreDescriptionKey(auditReport.score))}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-outline-variant/10 text-center">
        <div className="space-y-0.5">
          <p className="text-[10px] text-on-surface-variant">{t('dashboard.score.savedItems')}</p>
          <p className="text-sm font-bold text-on-surface font-mono">{activeItemCount}</p>
        </div>
        <div className="space-y-0.5 border-x border-outline-variant/10">
          <p className="text-[10px] text-on-surface-variant">{t('dashboard.score.weakPasswords')}</p>
          <p className={`text-sm font-bold font-mono ${auditReport.weakCount > 0 ? 'text-red-400' : 'text-brand-tertiary'}`}>
            {auditReport.weakCount}
          </p>
        </div>
        <div className="space-y-0.5 font-mono">
          <p className="text-[10px] text-on-surface-variant font-sans">{t('dashboard.score.reusedPasswords')}</p>
          <p className={`text-sm font-bold ${auditReport.reusedCount > 0 ? 'text-amber-300' : 'text-brand-tertiary'}`}>
            {auditReport.reusedCount}
          </p>
        </div>
      </div>
    </div>
  );
}
