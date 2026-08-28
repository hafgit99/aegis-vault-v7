import { useSyncExternalStore } from 'react';
import { AlertTriangle, Fingerprint } from 'lucide-react';

import { useLanguage } from '../i18n/LanguageContext';
import { getArgon2DegradationInfo, subscribeArgon2Degradation } from '../lib/argon2id';

export default function CryptoShieldPanel() {
  const { t } = useLanguage();

  // D2: Surface KDF memory degradation to the user instead of logging it silently.
  const degradation = useSyncExternalStore(subscribeArgon2Degradation, getArgon2DegradationInfo);

  return (
    <div className="surface-panel rounded-xl p-5 flex flex-col justify-between gap-4">
      <div>
        <div className="flex items-center justify-between border-b border-outline-variant/10 pb-3 mb-3">
          <h3 className="font-display text-xs font-bold uppercase tracking-widest text-brand-tertiary flex items-center gap-2">
            <Fingerprint className="w-4 h-4 text-brand-primary" />
            <span>{t('dashboard.crypto.title')}</span>
          </h3>
          <span className="text-[10px] text-on-surface-variant font-mono">{t('dashboard.crypto.statusActive')}</span>
        </div>
        <div className="space-y-3 text-xs text-on-surface-variant leading-relaxed">
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.engine')}</span>
            <span className="font-mono text-[10px] text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded border border-brand-primary/25 font-bold">
              {t('dashboard.crypto.engineValue')}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
            <span className="font-semibold text-on-surface">{t('dashboard.crypto.clientSecurity')}</span>
            <span className="font-mono text-[10px] text-brand-tertiary bg-[#059669]/10 px-2.5 py-0.5 rounded border border-brand-tertiary/25 font-bold">
              {t('dashboard.crypto.clientSecurityValue')}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-outline-variant/10 pb-2">
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
        {degradation && (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-on-surface-variant leading-relaxed"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{t('dashboard.crypto.degradedTitle')}</span>
            </div>
            <p className="mt-1">{t('dashboard.crypto.degradedDesc')}</p>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px]">
              <span>
                Argon2id: {Math.round(degradation.activeMemoryKiB / 1024)} / {Math.round(degradation.requestedMemoryKiB / 1024)} MiB
              </span>
              <span className={degradation.writeBlocked ? 'font-bold text-red-400' : 'font-bold text-amber-400'}>
                {degradation.writeBlocked
                  ? t('dashboard.crypto.degradedWritesBlocked')
                  : t('dashboard.crypto.degradedReducedSecurity')}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
