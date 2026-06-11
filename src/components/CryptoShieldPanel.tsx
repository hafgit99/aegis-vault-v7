import { Fingerprint } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';

export default function CryptoShieldPanel() {
  const { t } = useLanguage();

  return (
    <div className="bg-[#101210]/60 border border-outline-variant/15 rounded-2xl p-6 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-center justify-between border-b border-outline-variant/10 pb-3 mb-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-[#059669] flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-brand-primary animate-pulse" />
            <span>{t('dashboard.crypto.title')}</span>
          </h3>
          <span className="text-[10px] text-on-surface-variant font-mono">{t('dashboard.crypto.statusActive')}</span>
        </div>
        <div className="space-y-3 text-xs text-on-surface-variant leading-relaxed">
          <div className="flex items-center justify-between border-b border-[#141614] pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.engine')}</span>
            <span className="font-mono text-[10px] text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded border border-brand-primary/25 font-bold">
              {t('dashboard.crypto.engineValue')}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[#141614] pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.clientSecurity')}</span>
            <span className="font-mono text-[10px] text-brand-tertiary bg-[#059669]/10 px-2.5 py-0.5 rounded border border-brand-tertiary/25 font-bold">
              {t('dashboard.crypto.clientSecurityValue')}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-[#141614] pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.hashDepth')}</span>
            <span className="font-mono text-[10px] text-brand-secondary bg-brand-secondary/10 px-2.5 py-0.5 rounded border border-brand-secondary/25 font-bold">
              {t('dashboard.crypto.hashDepthValue')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.securityStatus')}</span>
            <span className="font-mono text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded border border-emerald-500/25 uppercase tracking-wider">
              {t('dashboard.crypto.securityStatusValue')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
