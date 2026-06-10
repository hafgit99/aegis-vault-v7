import { AlertTriangle, ShieldCheck } from 'lucide-react';

import { AuditReport } from '../types';

interface AegisGuardReportProps {
  auditReport: AuditReport;
}

export default function AegisGuardReport({ auditReport }: AegisGuardReportProps) {
  const isSecure = auditReport.score >= 85;

  return (
    <div className="bg-[#111211] border border-outline-variant/10 rounded-2xl p-4 flex gap-4 text-xs">
      <div className="w-10 h-10 rounded-xl bg-[#141614] border border-outline-variant/15 flex items-center justify-center shrink-0">
        {isSecure ? (
          <ShieldCheck className="w-5 h-5 text-brand-tertiary" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
        )}
      </div>
      <div className="space-y-1">
        <h4 className="font-bold text-on-surface">Aegis Guard Güvenlik Raporu</h4>
        <p className="text-on-surface-variant text-[11px] leading-relaxed opacity-90">
          {isSecure
            ? 'Parola koruma mekanizmalarınız tam performans çalışmaktadır. Hiçbir riskli nokta tespit edilemedi. Yerel kasanız güvenli tutulmaktadır.'
            : `Hassas senedinizde ${auditReport.weakCount} adet zayıf ve ${auditReport.reusedCount} adet çift kullanılmış parola tespit edilmiştir. Kritik sızıntıları önlemek için Şifre Denetleyicisi sayfamızı ziyaret etmenizi tavsiye ederiz.`}
        </p>
      </div>
    </div>
  );
}
