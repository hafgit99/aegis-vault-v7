/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Cloud, Wifi, Check, CloudOff, RotateCcw, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';

interface SettingsSyncSectionProps {
  syncProvider: 'disabled' | 'webdav';
  setSyncProvider: (provider: 'disabled' | 'webdav') => void;
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  syncUsername: string;
  setSyncUsername: (username: string) => void;
  syncPassword: string;
  setSyncPassword: (password: string) => void;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error' | 'conflict';
  syncMessage: string | null;
  syncLastAt: string | null;
  syncTestResult: string | null;
  syncTestLoading: boolean;
  syncLoading: boolean;
  onSyncTest: () => void;
  onSyncSave: () => void;
  onSyncDisable: () => void;
  onSyncNow: () => void;
  t: (key: string) => string;
}

export function SettingsSyncSection({
  syncProvider,
  setSyncProvider,
  syncUrl,
  setSyncUrl,
  syncUsername,
  setSyncUsername,
  syncPassword,
  setSyncPassword,
  syncStatus,
  syncMessage,
  syncLastAt,
  syncTestResult,
  syncTestLoading,
  syncLoading,
  onSyncTest,
  onSyncSave,
  onSyncDisable,
  onSyncNow,
  t,
}: SettingsSyncSectionProps) {
  const syncTestSucceeded = syncTestResult === t('settings.sync.test.success');

  return (
    <div className="p-4 sm:p-6 bg-surface-elevated border border-white/5 rounded-2xl space-y-5" id="sync-section">
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
        <Cloud className="w-4 h-4 text-brand-primary" />
        <span>{t('settings.sync.title')}</span>
      </h3>
      <p className="text-xs text-on-surface-variant leading-relaxed">{t('settings.sync.description')}</p>

      {/* Provider Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          {t('settings.sync.provider.label')}
        </label>
        <select
          id="sync-provider-select"
          value={syncProvider}
          onChange={e => setSyncProvider(e.target.value as 'disabled' | 'webdav')}
          className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-1 focus:ring-brand-primary"
        >
          <option value="disabled">{t('settings.sync.provider.disabled')}</option>
          <option value="webdav">{t('settings.sync.provider.webdav')}</option>
        </select>
      </div>

      {/* WebDAV Config Form */}
      {syncProvider === 'webdav' && (
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.configure.url')}</label>
            <input
              id="sync-webdav-url"
              type="url"
              value={syncUrl}
              onChange={e => setSyncUrl(e.target.value)}
              placeholder={t('settings.sync.configure.urlPlaceholder')}
              className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.configure.username')}</label>
              <input
                id="sync-webdav-username"
                type="text"
                autoComplete="username"
                value={syncUsername}
                onChange={e => setSyncUsername(e.target.value)}
                placeholder={t('settings.sync.configure.usernamePlaceholder')}
                className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.configure.password')}</label>
              <input
                id="sync-webdav-password"
                type="password"
                autoComplete="current-password"
                value={syncPassword}
                onChange={e => setSyncPassword(e.target.value)}
                placeholder={t('settings.sync.configure.passwordPlaceholder')}
                className="w-full bg-surface border border-white/10 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          </div>

          {/* Test Connection */}
          <button
            id="sync-test-btn"
            onClick={onSyncTest}
            disabled={syncTestLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-brand-primary/40 text-brand-primary hover:bg-brand-primary/10 text-xs font-medium transition-all disabled:opacity-50 cursor-pointer"
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>{syncTestLoading ? '…' : t('settings.sync.configure.testConnection')}</span>
          </button>
          {syncTestResult && (
            <p className={`text-xs px-1 ${syncTestSucceeded ? 'text-green-400' : 'text-red-400'}`}>
              {syncTestResult}
            </p>
          )}

          {/* Save / Disable buttons */}
          <div className="flex gap-2 flex-wrap">
            <button
              id="sync-save-btn"
              onClick={onSyncSave}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-primary text-brand-on-primary font-semibold text-xs hover:opacity-90 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{t('settings.sync.configure.save')}</span>
            </button>
            <button
              id="sync-disable-btn"
              onClick={onSyncDisable}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-white/15 text-on-surface-variant hover:text-brand-error hover:border-brand-error/40 font-medium text-xs transition-all cursor-pointer"
            >
              <CloudOff className="w-3.5 h-3.5" />
              <span>{t('settings.sync.configure.disable')}</span>
            </button>
          </div>
          {syncMessage && (
            <p className="text-xs text-on-surface-variant px-1">{syncMessage}</p>
          )}
        </div>
      )}

      {/* Sync Now + Status */}
      {syncProvider === 'webdav' && (
        <div className="border-t border-white/10 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-on-surface">{t('settings.sync.lastSync')}</p>
              <p className="text-xs text-on-surface-variant">
                {syncLastAt
                  ? new Date(syncLastAt).toLocaleString()
                  : t('settings.sync.never')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {syncStatus === 'success' && <CheckCircle className="w-4 h-4 text-green-400" />}
              {syncStatus === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
              {syncStatus === 'conflict' && <AlertCircle className="w-4 h-4 text-yellow-400" />}
              {syncStatus === 'syncing' && <RefreshCw className="w-4 h-4 text-brand-primary animate-spin" />}
              <button
                id="sync-now-btn"
                onClick={onSyncNow}
                disabled={syncLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-primary/90 hover:bg-brand-primary text-brand-on-primary font-semibold text-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${syncLoading ? 'animate-spin' : ''}`} />
                <span>{syncLoading ? t('settings.sync.syncNowLoading') : t('settings.sync.syncNow')}</span>
              </button>
            </div>
          </div>
          {syncStatus !== 'idle' && (
            <p className={`text-xs px-1 ${
              syncStatus === 'success' ? 'text-green-400' :
              syncStatus === 'conflict' ? 'text-yellow-400' :
              syncStatus === 'error' ? 'text-red-400' :
              'text-on-surface-variant'
            }`}>
              {syncStatus === 'syncing' ? t('settings.sync.status.syncing') :
               syncStatus === 'success' ? t('settings.sync.status.success') :
               syncStatus === 'conflict' ? t('settings.sync.status.conflict') :
               syncStatus === 'error' ? t('settings.sync.status.error') : ''}
              {syncMessage && <span className="ml-1">— {syncMessage}</span>}
            </p>
          )}
          {syncStatus === 'conflict' && (
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 space-y-1">
              <p className="text-xs font-semibold text-yellow-300">{t('settings.sync.conflict.title')}</p>
              <p className="text-xs text-yellow-200/70">{t('settings.sync.conflict.description')}</p>
            </div>
          )}
        </div>
      )}

      {/* Zero-Knowledge Note */}
      <p className="text-xs text-on-surface-variant/60 italic border-t border-white/5 pt-3">
        {t('settings.sync.securityNote')}
      </p>
    </div>
  );
}
