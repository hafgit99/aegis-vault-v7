/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Cloud, Wifi, Check, CloudOff, RotateCcw, CheckCircle, AlertCircle, RefreshCw, Server, Database } from 'lucide-react';
import type { SyncProviderType } from '../../lib/sync';
import type { TFunction } from '../../i18n/LanguageContext';

export interface SettingsSyncSectionProps {
  syncProvider: SyncProviderType;
  setSyncProvider: (provider: SyncProviderType) => void;
  // WebDAV fields
  syncUrl: string;
  setSyncUrl: (url: string) => void;
  syncUsername: string;
  setSyncUsername: (username: string) => void;
  syncPassword: string;
  setSyncPassword: (password: string) => void;
  // S3 fields
  s3Endpoint: string;
  setS3Endpoint: (endpoint: string) => void;
  s3Region: string;
  setS3Region: (region: string) => void;
  s3Bucket: string;
  setS3Bucket: (bucket: string) => void;
  s3AccessKeyId: string;
  setS3AccessKeyId: (accessKeyId: string) => void;
  s3SecretAccessKey: string;
  setS3SecretAccessKey: (secretAccessKey: string) => void;
  // State & Callbacks
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
  t: TFunction;
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
  s3Endpoint,
  setS3Endpoint,
  s3Region,
  setS3Region,
  s3Bucket,
  setS3Bucket,
  s3AccessKeyId,
  setS3AccessKeyId,
  s3SecretAccessKey,
  setS3SecretAccessKey,
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
    <div className="p-4 sm:p-6 bg-surface-low/80 border border-outline-variant/10 rounded-2xl space-y-5" id="sync-section">
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-outline-variant/10 pb-2">
        <Cloud className="w-4 h-4 text-brand-primary" />
        <span>{t('settings.sync.title')}</span>
      </h3>
      <p className="text-xs text-on-surface-variant leading-relaxed">{t('settings.sync.description')}</p>

      {/* Provider Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
          {t('settings.sync.provider.label')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setSyncProvider('disabled')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              syncProvider === 'disabled'
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-outline-variant/20 bg-surface-lowest text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <CloudOff className="w-3.5 h-3.5" />
            <span>{t('settings.sync.provider.disabledShort')}</span>
          </button>

          <button
            type="button"
            onClick={() => setSyncProvider('webdav')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              syncProvider === 'webdav'
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-outline-variant/20 bg-surface-lowest text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Server className="w-3.5 h-3.5" />
            <span>WebDAV / Nextcloud</span>
          </button>

          <button
            type="button"
            onClick={() => setSyncProvider('s3')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all cursor-pointer ${
              syncProvider === 's3'
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-outline-variant/20 bg-surface-lowest text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>S3 / MinIO / R2</span>
          </button>
        </div>
      </div>

      {/* WebDAV Config Form */}
      {syncProvider === 'webdav' && (
        <div className="space-y-3 pt-2">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.configure.url')}</label>
            <input
              id="sync-webdav-url"
              type="url"
              value={syncUrl}
              onChange={(e) => setSyncUrl(e.target.value)}
              placeholder={t('settings.sync.configure.urlPlaceholder')}
              className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
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
                onChange={(e) => setSyncUsername(e.target.value)}
                placeholder={t('settings.sync.configure.usernamePlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.configure.password')}</label>
              <input
                id="sync-webdav-password"
                type="password"
                autoComplete="current-password"
                value={syncPassword}
                onChange={(e) => setSyncPassword(e.target.value)}
                placeholder={t('settings.sync.configure.passwordPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* S3 Config Form */}
      {syncProvider === 's3' && (
        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.s3.endpointUrl')}</label>
              <input
                id="sync-s3-endpoint"
                type="url"
                value={s3Endpoint}
                onChange={(e) => setS3Endpoint(e.target.value)}
                placeholder={t('settings.sync.s3.endpointPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.s3.region')}</label>
              <input
                id="sync-s3-region"
                type="text"
                value={s3Region}
                onChange={(e) => setS3Region(e.target.value)}
                placeholder={t('settings.sync.s3.regionPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.s3.bucket')}</label>
              <input
                id="sync-s3-bucket"
                type="text"
                value={s3Bucket}
                onChange={(e) => setS3Bucket(e.target.value)}
                placeholder={t('settings.sync.s3.bucketPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.s3.accessKeyId')}</label>
              <input
                id="sync-s3-access-key"
                type="text"
                value={s3AccessKeyId}
                onChange={(e) => setS3AccessKeyId(e.target.value)}
                placeholder={t('settings.sync.s3.accessKeyPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-on-surface-variant">{t('settings.sync.s3.secretAccessKey')}</label>
              <input
                id="sync-s3-secret-key"
                type="password"
                value={s3SecretAccessKey}
                onChange={(e) => setS3SecretAccessKey(e.target.value)}
                placeholder={t('settings.sync.s3.secretKeyPlaceholder')}
                className="w-full bg-surface-lowest border border-outline-variant/20 rounded-lg px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-brand-primary"
              />
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons for configured providers */}
      {syncProvider !== 'disabled' && (
        <div className="space-y-3 pt-2">
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
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-outline-variant/15 text-on-surface-variant hover:text-brand-error hover:border-brand-error/40 font-medium text-xs transition-all cursor-pointer"
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
      {syncProvider !== 'disabled' && (
        <div className="border-t border-outline-variant/10 pt-4 space-y-3">
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
      <p className="text-xs text-on-surface-variant/60 italic border-t border-outline-variant/10 pt-3">
        {t('settings.sync.securityNote')}
      </p>
    </div>
  );
}
