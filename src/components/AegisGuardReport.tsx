import { AlertTriangle, ShieldCheck } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { APP_SECURITY_BRAND } from '../lib/branding';
import { AuditReport } from '../types';

interface AegisGuardReportProps {
  auditReport: AuditReport;
}

export default function AegisGuardReport({ auditReport }: AegisGuardReportProps) {
  const { t } = useLanguage();
  const isSecure = auditReport.score >= 85;

  return (
    <div className="surface-card rounded-xl p-4 flex gap-4 text-xs">
      <div className="icon-tile bg-surface-low shrink-0">
        {isSecure ? (
          <ShieldCheck className="w-5 h-5 text-brand-tertiary" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
        )}
      </div>
      <div className="space-y-1">
        <h4 className="font-bold text-on-surface">{APP_SECURITY_BRAND} {t('dashboard.guard.titleSuffix')}</h4>
        <p className="text-on-surface-variant text-[11px] leading-relaxed opacity-90">
          {isSecure
            ? t('dashboard.guard.secureDescription')
            : `${t('dashboard.guard.riskyPrefix')} ${auditReport.weakCount} ${t('dashboard.guard.weakSuffix')} ${t('dashboard.guard.connector')} ${auditReport.reusedCount} ${t('dashboard.guard.reusedSuffix')}`}
        </p>
      </div>
    </div>
  );
}
