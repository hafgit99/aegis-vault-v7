import { useLanguage } from '../i18n/LanguageContext';
import type { TranslationKey } from '../i18n/translations';

interface VaultItemSecurityAssessmentProps {
  score: number;
  onOpenAudit: () => void;
}

function getToneClass(score: number): string {
  if (score >= 85) return 'text-brand-tertiary';
  if (score >= 50) return 'text-brand-secondary';
  return 'text-brand-error';
}

function getBorderClass(score: number): string {
  if (score >= 85) return 'border-l-brand-tertiary';
  if (score >= 50) return 'border-l-brand-secondary';
  return 'border-l-brand-error';
}

function getButtonClass(score: number): string {
  if (score >= 85) return 'bg-brand-tertiary/15 text-brand-tertiary hover:bg-brand-tertiary/20';
  if (score >= 50) return 'bg-brand-secondary/15 text-brand-secondary hover:bg-brand-secondary/20';
  return 'bg-brand-error/15 text-brand-error hover:bg-brand-error/20 animate-pulse';
}

function getDescriptionKey(score: number): TranslationKey {
  if (score >= 85) {
    return 'detail.security.secureDescription';
  }
  if (score >= 50) {
    return 'detail.security.mediumDescription';
  }
  return 'detail.security.criticalDescription';
}

export default function VaultItemSecurityAssessment({ score, onOpenAudit }: VaultItemSecurityAssessmentProps) {
  const { t } = useLanguage();
  const toneClass = getToneClass(score);

  return (
    <div
      className={`glass-panel p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 border-l-4 ${getBorderClass(score)}`}
    >
      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
        <div className="relative w-12 h-12 sm:w-14 sm:h-14 shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-[#1e201e] stroke-current"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeWidth="3"
            ></path>
            <path
              className={`${toneClass} stroke-current`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              strokeDasharray={`${score}, 100`}
              strokeLinecap="round"
              strokeWidth="3"
            ></path>
          </svg>
          <div className={`absolute inset-0 flex items-center justify-center font-mono font-bold text-xs truncate ${toneClass}`}>
            %{score}
          </div>
        </div>
        <div className="min-w-0">
          <h4 className="font-bold text-sm text-on-surface">{t('detail.security.title')}</h4>
          <p className="text-on-surface-variant text-[11px] mt-0.5 leading-relaxed">{t(getDescriptionKey(score))}</p>
        </div>
      </div>
      <button onClick={onOpenAudit} className={`text-xs font-bold px-3 py-2 rounded-lg shrink-0 w-full sm:w-auto ${getButtonClass(score)}`}>
        {t('detail.security.auditAll')}
      </button>
    </div>
  );
}
