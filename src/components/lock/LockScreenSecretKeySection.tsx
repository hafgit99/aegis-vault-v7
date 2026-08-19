/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { KeyRound, Download } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface LockScreenSecretKeySectionProps {
  secretKey: string;
  setSecretKey: (val: string) => void;
  isSetup: boolean;
  requiresSecretKey: boolean;
  rememberSecretKey: boolean;
  setRememberSecretKey: (val: boolean) => void;
  onDownloadEmergencyKit: () => void | Promise<void>;
}

export function LockScreenSecretKeySection({
  secretKey,
  setSecretKey,
  isSetup,
  requiresSecretKey,
  rememberSecretKey,
  setRememberSecretKey,
  onDownloadEmergencyKit,
}: LockScreenSecretKeySectionProps) {
  const { t } = useLanguage();

  if (isSetup && !requiresSecretKey) {
    return null;
  }

  return (
    <div className="rounded-2xl glass-panel p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-brand-primary/10 border border-brand-primary/20 flex items-center justify-center text-brand-primary shrink-0">
          <KeyRound className="w-4.5 h-4.5" />
        </div>
        <div className="text-left">
          <p className="text-xs font-bold text-on-surface">{t('lock.secret.title')}</p>
        </div>
      </div>

      <label className="block">
        <span className="block text-[10px] font-bold tracking-wider text-on-surface-variant uppercase mb-2">
          {t('lock.secret.label')}
        </span>
        <input
          data-testid="lock-secret-key-input"
          type="text"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          readOnly={!isSetup}
          className="w-full bg-surface-lowest border border-outline-variant/30 rounded-xl px-3 py-2.5 sm:py-3 text-on-surface focus:ring-2 focus:ring-brand-primary/20 focus:outline-none transition-all text-center tracking-wider text-xs font-mono"
          placeholder="A3-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          required={requiresSecretKey}
        />
      </label>

      <label className="flex items-start gap-2 text-left text-[11px] text-on-surface-variant cursor-pointer">
        <input
          data-testid="lock-remember-secret-key-checkbox"
          type="checkbox"
          checked={rememberSecretKey}
          onChange={(e) => setRememberSecretKey(e.target.checked)}
          className="mt-0.5 accent-brand-primary cursor-pointer"
        />
        <span>
          {t('lock.secret.rememberThisDevice')}
        </span>
      </label>

      {!isSetup && (
        <button
          data-testid="lock-emergency-kit-button"
          type="button"
          onClick={onDownloadEmergencyKit}
          className="w-full flex items-center justify-center gap-2 text-xs font-bold border border-brand-primary/25 bg-brand-primary/10 hover:bg-brand-primary/15 text-brand-primary py-2.5 sm:py-3 rounded-xl transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          <span>{t('lock.secret.downloadEmergencyKit')}</span>
        </button>
      )}
    </div>
  );
}
