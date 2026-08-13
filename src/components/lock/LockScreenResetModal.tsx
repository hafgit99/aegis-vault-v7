/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface LockScreenResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmReset: () => Promise<void>;
  resetLoading: boolean;
}

export function LockScreenResetModal({
  isOpen,
  onClose,
  onConfirmReset,
  resetLoading,
}: LockScreenResetModalProps) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm mx-4 surface-panel rounded-2xl p-6 space-y-5 animate-fade-in">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h2 className="font-display text-lg font-bold text-on-surface">{t('lock.reset.title')}</h2>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('lock.reset.description')}
          </p>
        </div>
        <div className="flex items-center gap-3 p-3 rounded-xl bg-red-500/5 border border-red-500/15">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-[11px] text-red-400 font-medium leading-relaxed">
            {t('lock.reset.warning')}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            data-testid="lock-reset-cancel-button"
            type="button"
            onClick={onClose}
            disabled={resetLoading}
            className="flex-1 py-3 rounded-xl border border-outline-variant/20 text-on-surface text-xs font-bold hover:bg-surface-low transition-all cursor-pointer"
          >
            {t('lock.reset.cancel')}
          </button>
          <button
            data-testid="lock-reset-confirm-button"
            type="button"
            disabled={resetLoading}
            onClick={onConfirmReset}
            className="flex-1 py-3 rounded-xl bg-red-500/90 hover:bg-red-500 text-white text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            {resetLoading ? (
              <RotateCcw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            <span>{resetLoading ? t('lock.reset.resetting') : t('lock.reset.confirm')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
