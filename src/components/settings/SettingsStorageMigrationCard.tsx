/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Database, RefreshCw, CheckCircle, AlertCircle } from 'lucide-react';
import type { useLanguage } from '../../i18n/LanguageContext';

interface SettingsStorageMigrationCardProps {
  storageMigrationStatus: 'idle' | 'running' | 'promoted' | 'blocked' | 'error';
  storageMigrationMessage: string | null;
  onMigrate: () => void | Promise<void>;
  t: ReturnType<typeof useLanguage>['t'];
}

export function SettingsStorageMigrationCard({
  storageMigrationStatus,
  storageMigrationMessage,
  onMigrate,
  t,
}: SettingsStorageMigrationCardProps) {
  return (
    <div className="p-4 sm:p-6 bg-surface-elevated border border-white/5 rounded-2xl space-y-4" id="storage-backend-section">
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
        <Database className="w-4 h-4 text-brand-primary" />
        <span>{t('settings.storageMigration.title')}</span>
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('settings.storageMigration.description')}
          </p>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-wider font-semibold">
            <span className="px-2.5 py-1 rounded-full border border-white/10 bg-surface text-on-surface-variant">
              {t('settings.storageMigration.current')}
            </span>
            <span className="px-2.5 py-1 rounded-full border border-brand-primary/30 bg-brand-primary/10 text-brand-primary">
              {t('settings.storageMigration.target')}
            </span>
          </div>
        </div>
        <button
          data-testid="wa-sqlite-migration-button"
          onClick={onMigrate}
          disabled={storageMigrationStatus === 'running'}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-xs font-bold text-brand-on-primary transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer"
        >
          {storageMigrationStatus === 'running' ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Database className="w-4 h-4" />
          )}
          <span>
            {storageMigrationStatus === 'running'
              ? t('settings.storageMigration.running')
              : t('settings.storageMigration.button')}
          </span>
        </button>
      </div>
      {storageMigrationMessage && (
        <div
          data-testid="wa-sqlite-migration-message"
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
            storageMigrationStatus === 'promoted'
              ? 'border-brand-tertiary/20 bg-brand-tertiary/10 text-brand-tertiary'
              : storageMigrationStatus === 'blocked'
                ? 'border-yellow-500/20 bg-yellow-500/10 text-yellow-200'
                : 'border-brand-error/20 bg-brand-error/10 text-brand-error'
          }`}
        >
          {storageMigrationStatus === 'promoted' ? (
            <CheckCircle className="mt-0.5 w-3.5 h-3.5" />
          ) : (
            <AlertCircle className="mt-0.5 w-3.5 h-3.5" />
          )}
          <span>{storageMigrationMessage}</span>
        </div>
      )}
    </div>
  );
}
