/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Database, RefreshCw, ShieldCheck } from 'lucide-react';
import type { TranslationKey } from '../../i18n/translations';

type TFunction = (key: TranslationKey) => string;

interface SettingsStatsCardProps {
  itemCount: number;
  onReseedDemo: () => void;
  t: TFunction;
}

export function SettingsStatsCard({ itemCount, onReseedDemo, t }: SettingsStatsCardProps) {
  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl md:col-span-1 space-y-4" id="stats-card">
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
        <Database className="w-4 h-4 text-brand-primary" />
        <span>{t('settings.stats.title')}</span>
      </h3>
      <div className="space-y-3 pt-1">
        <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
          <span className="text-on-surface-variant">{t('settings.stats.totalItems')}</span>
          <span className="font-mono font-bold text-brand-primary">{itemCount}</span>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
          <span className="text-on-surface-variant">{t('settings.stats.secureStructure')}</span>
          <span className="text-[#10b981] font-bold text-xs flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> AES-GCM
          </span>
        </div>
        <div className="flex justify-between items-center text-sm border-b border-outline-variant/10 pb-2">
          <span className="text-on-surface-variant">{t('settings.stats.dataLocation')}</span>
          <span className="text-xs text-brand-tertiary">{t('settings.stats.browserMemory')}</span>
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={onReseedDemo}
          className="w-full flex items-center justify-center gap-2 text-xs font-semibold bg-[#1a1c1a] border border-outline-variant/25 hover:bg-[#252825] py-3 rounded-lg text-on-surface-variant hover:text-on-surface transition-all cursor-pointer"
          id="demo-reseed-btn"
        >
          <RefreshCw className="w-4 h-4" />
          <span>{t('settings.stats.reseedDemo')}</span>
        </button>
      </div>
    </div>
  );
}
