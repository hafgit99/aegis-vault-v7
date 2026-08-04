/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';
import { SyncStatus } from '../lib/sync';

export interface SyncStatusBadgeProps {
  status: SyncStatus;
  lastSyncAt: string | null;
  isConfigured: boolean;
  onManualSync?: () => void;
  className?: string;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  status,
  lastSyncAt,
  isConfigured,
  onManualSync,
  className = '',
}) => {
  if (!isConfigured) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 ${className}`}
        title="Senkronizasyon devre dışı"
      >
        <CloudOff className="w-3.5 h-3.5" />
        <span>Eşleşme Yok</span>
      </div>
    );
  }

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const timeStr = formatTime(lastSyncAt);

  return (
    <button
      type="button"
      onClick={onManualSync}
      disabled={status === 'syncing'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer disabled:cursor-not-allowed ${
        status === 'syncing'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
          : status === 'success'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60'
          : status === 'error'
          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-900/60'
          : status === 'conflict'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/60'
          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      } ${className}`}
      title={
        status === 'syncing'
          ? 'Senkronize ediliyor...'
          : status === 'error'
          ? 'Senkronizasyon hatası — tekrar denemek için tıklayın'
          : status === 'conflict'
          ? 'Zaman çakışması var — incelemek için tıklayın'
          : timeStr
          ? `Son senkronizasyon: ${timeStr}`
          : 'Senkronizasyon hazır — şimdi çalıştırmak için tıklayın'
      }
    >
      {status === 'syncing' ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : status === 'success' ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : status === 'error' ? (
        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
      ) : status === 'conflict' ? (
        <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
      ) : (
        <Cloud className="w-3.5 h-3.5" />
      )}

      <span>
        {status === 'syncing'
          ? 'Eşleniyor...'
          : status === 'error'
          ? 'Hata'
          : status === 'conflict'
          ? 'Çakışma'
          : timeStr
          ? `Eşlendi (${timeStr})`
          : 'Eşlendi'}
      </span>
    </button>
  );
};
