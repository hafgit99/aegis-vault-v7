import { ShieldCheck } from 'lucide-react';

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

function getScoreTitle(score: number): string {
  if (score >= 85) return 'Kasanız Tamamen Güvende';
  if (score >= 50) return 'Orta Düzey Güvenlik Seviyesi';
  return 'Kritik Parola Güvenliği Açığı!';
}

function getScoreDescription(score: number): string {
  if (score >= 85) {
    return 'Tüm parolalarınız mükemmel karmaşıklık standartlarında ayarlanmış. Aegis kalkanı tam güvenlikle çalışıyor.';
  }

  return 'Bazı zayıf veya birbiriyle aynı olan şifreleriniz var. Şifrelerinizi özelleştirerek koruma seviyesini artırabilirsiniz.';
}

export default function DashboardSecurityScoreCard({ auditReport, activeItemCount }: DashboardSecurityScoreCardProps) {
  return (
    <div className="md:col-span-7 bg-[#101210]/60 border border-outline-variant/15 rounded-2xl p-6 flex flex-col justify-between gap-6 relative overflow-hidden group hover:border-brand-primary/15 transition-all">
      <div className="absolute top-0 right-0 w-32 h-32 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-center justify-between col-span-full">
        <div className="space-y-1">
          <span className="text-[10px] font-bold tracking-widest text-[#059669] uppercase flex items-center gap-1.5 bg-[#059669]/10 px-2.5 py-1 rounded-full w-fit">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Sanal Koruma Skoru</span>
          </span>
        </div>
        <span className="text-[10px] text-on-surface-variant font-mono">Çift Kademeli AES-256</span>
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
            <span className="text-[9px] text-on-surface-variant/70 tracking-widest uppercase">Güç</span>
          </div>
        </div>

        <div className="space-y-2 text-center sm:text-left">
          <h3 className="font-display font-bold text-base text-on-surface">{getScoreTitle(auditReport.score)}</h3>
          <p className="text-on-surface-variant text-xs leading-relaxed">{getScoreDescription(auditReport.score)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 pt-4 border-t border-outline-variant/10 text-center">
        <div className="space-y-0.5">
          <p className="text-[10px] text-on-surface-variant">Kayıtlı Öğe</p>
          <p className="text-sm font-bold text-on-surface font-mono">{activeItemCount}</p>
        </div>
        <div className="space-y-0.5 border-x border-outline-variant/10">
          <p className="text-[10px] text-on-surface-variant">Zayıf Şifre</p>
          <p className={`text-sm font-bold font-mono ${auditReport.weakCount > 0 ? 'text-red-400' : 'text-brand-tertiary'}`}>
            {auditReport.weakCount}
          </p>
        </div>
        <div className="space-y-0.5 font-mono">
          <p className="text-[10px] text-on-surface-variant font-sans">Ortak Şifre</p>
          <p className={`text-sm font-bold ${auditReport.reusedCount > 0 ? 'text-amber-300' : 'text-brand-tertiary'}`}>
            {auditReport.reusedCount}
          </p>
        </div>
      </div>
    </div>
  );
}
