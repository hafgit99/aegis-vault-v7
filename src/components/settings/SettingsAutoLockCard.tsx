/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { Clock } from 'lucide-react';

interface LockOption {
  label: string;
  value: number;
}

interface SettingsAutoLockCardProps {
  autoLockDuration: number;
  lockOptions: LockOption[];
  onAutoLockDurationChange: (val: number) => void;
}

export function SettingsAutoLockCard({
  autoLockDuration,
  lockOptions,
  onAutoLockDurationChange,
}: SettingsAutoLockCardProps) {
  const { t } = useLanguage();
  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center" id="auto-lock-settings-card">
      <div className="md:col-span-1 space-y-1.5">
        <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>{t('settings.autoLock.title')}</span>
        </h3>
        <p className="hidden sm:block text-xs text-on-surface-variant">
          {t('settings.autoLock.description')}
        </p>
      </div>
      
      <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {lockOptions.map((opt) => {
          const isSelected = autoLockDuration === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onAutoLockDurationChange(opt.value)}
              className={`py-3 px-2 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                isSelected
                  ? 'border-brand-primary bg-brand-primary/15 text-brand-primary shadow-md'
                  : 'border-outline-variant/15 bg-surface-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
