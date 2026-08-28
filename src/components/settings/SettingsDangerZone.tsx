/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Trash2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface SettingsDangerZoneProps {
  onResetAll: () => void;
}

export function SettingsDangerZone({ onResetAll }: SettingsDangerZoneProps) {
  const { t } = useLanguage();
  return (
    <div className="p-4 sm:p-6 bg-brand-error/5 border border-brand-error/20 rounded-2xl space-y-4" id="danger-zone-section">
      <h3 className="font-bold text-sm text-brand-error uppercase tracking-wider flex items-center gap-2 border-b border-brand-error/10 pb-2">
        <Trash2 className="w-4 h-4" />
        <span>{t('settings.danger.title')}</span>
      </h3>
      <p className="hidden sm:block text-xs text-on-surface-variant leading-relaxed">
        {t('settings.danger.description')}
      </p>
      <button
        onClick={onResetAll}
        className="flex items-center gap-2 px-5 py-3 rounded-lg border-2 border-brand-error hover:bg-brand-error hover:text-brand-on-error font-bold text-xs text-brand-error transition-all cursor-pointer"
      >
        <Trash2 className="w-4" />
        <span>{t('settings.danger.resetAll')}</span>
      </button>
    </div>
  );
}
