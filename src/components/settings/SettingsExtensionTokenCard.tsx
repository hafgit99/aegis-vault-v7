/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { RefreshCw } from 'lucide-react';

interface SettingsExtensionTokenCardProps {
  tokenRotateStatus: 'idle' | 'loading' | 'success' | 'error';
  tokenRotateMessage: string | null;
  onRotateToken: () => void | Promise<void>;
}

export function SettingsExtensionTokenCard({
  tokenRotateStatus,
  tokenRotateMessage,
  onRotateToken,
}: SettingsExtensionTokenCardProps) {
  const { t } = useLanguage();
  if (typeof window === 'undefined' || !window.__TAURI_INTERNALS__) {
    return null;
  }

  return (
    <div className="p-4 sm:p-6 bg-brand-surface-container rounded-2xl border border-white/8 space-y-3" id="extension-token-section">
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-white/5 pb-2">
        <RefreshCw className="w-4 h-4 text-brand-primary" />
        <span>{t('settings.extension.title')}</span>
      </h3>
      <p className="text-xs text-on-surface-variant leading-relaxed">
        {t('settings.extension.description')}
      </p>
      <button
        id="rotate-extension-token-btn"
        onClick={onRotateToken}
        disabled={tokenRotateStatus === 'loading'}
        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-primary/40 hover:bg-brand-primary/10 text-brand-primary font-semibold text-xs transition-all disabled:opacity-50 cursor-pointer"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${tokenRotateStatus === 'loading' ? 'animate-spin' : ''}`} />
        <span>{tokenRotateStatus === 'loading' ? t('settings.extension.rotating') : t('settings.extension.rotateBtn')}</span>
      </button>
      {tokenRotateMessage && (
        <p className={`text-xs px-1 ${tokenRotateStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {tokenRotateMessage}
        </p>
      )}
    </div>
  );
}
