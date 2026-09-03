/**
 * @file SettingsUpdateCard.tsx
 * @description Settings card for desktop app update checking, downloading, and restarting.
 *
 * @license Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import {
  ArrowUpCircle,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Download,
  RotateCw,
  Sparkles,
  Info,
} from 'lucide-react';
import { useAppUpdater } from '../../hooks/useAppUpdater';
import { isDesktopRuntime } from '../../lib/environment';

export function SettingsUpdateCard() {
  const { t } = useLanguage();
  const {
    status,
    supported,
    updateInfo,
    progress,
    errorMessage,
    errorKey,
    checkForUpdates,
    installUpdate,
    restartNow,
  } = useAppUpdater();

  const [currentVersion, setCurrentVersion] = useState<string>(() => {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '7.0.4';
  });

  useEffect(() => {
    let active = true;
    if (isDesktopRuntime()) {
      import('@tauri-apps/api/app')
        .then((m) => m.getVersion())
        .then((ver) => {
          if (active && ver) {
            setCurrentVersion(ver);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, []);

  const displayErrorMessage = errorKey ? t(errorKey as Parameters<typeof t>[0]) : errorMessage;

  return (
    <div
      className="p-4 sm:p-6 bg-surface-elevated border border-white/5 rounded-2xl space-y-4"
      id="app-updates-section"
      data-testid="app-updates-card"
    >
      <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
        <ArrowUpCircle className="w-4 h-4 text-brand-primary" />
        <span>{t('settings.updates.title')}</span>
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-start">
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('settings.updates.description')}
          </p>

          <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider font-semibold">
            <span
              data-testid="current-version-badge"
              className="px-2.5 py-1 rounded-full border border-white/10 bg-surface text-on-surface-variant flex items-center gap-1.5"
            >
              <Info className="w-3 h-3 text-on-surface-variant/70" />
              <span>{t('settings.updates.currentVersion')}: v{currentVersion}</span>
            </span>

            {!supported && (
              <span
                data-testid="desktop-only-badge"
                className="px-2.5 py-1 rounded-full border border-white/10 bg-surface text-on-surface-variant/80"
              >
                {t('settings.updates.desktopOnly')}
              </span>
            )}

            {status === 'upToDate' && (
              <span
                data-testid="up-to-date-badge"
                className="px-2.5 py-1 rounded-full border border-brand-tertiary/30 bg-brand-tertiary/10 text-brand-tertiary flex items-center gap-1"
              >
                <CheckCircle className="w-3 h-3" />
                <span>{t('settings.updates.upToDate')}</span>
              </span>
            )}

            {status === 'available' && updateInfo && (
              <span
                data-testid="update-available-badge"
                className="px-2.5 py-1 rounded-full border border-brand-primary/40 bg-brand-primary/15 text-brand-primary flex items-center gap-1 animate-pulse"
              >
                <Sparkles className="w-3 h-3" />
                <span>
                  {t('settings.updates.available')}: v{updateInfo.version}
                </span>
              </span>
            )}

            {status === 'downloaded' && (
              <span
                data-testid="downloaded-badge"
                className="px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center gap-1"
              >
                <CheckCircle className="w-3 h-3" />
                <span>{t('settings.updates.readyToRestart')}</span>
              </span>
            )}
          </div>

          {/* Release Notes if update is available */}
          {status === 'available' && updateInfo?.body && (
            <div
              data-testid="update-release-notes"
              className="p-3 bg-surface border border-white/10 rounded-lg text-xs text-on-surface-variant space-y-1.5"
            >
              <div className="font-semibold text-on-surface flex items-center gap-1 text-[11px]">
                <Sparkles className="w-3 h-3 text-brand-primary" />
                <span>v{updateInfo.version}</span>
                {updateInfo.date && (
                  <span className="text-on-surface-variant/60 font-normal">
                    ({new Date(updateInfo.date).toLocaleDateString()})
                  </span>
                )}
              </div>
              <p className="whitespace-pre-line text-[11px] max-h-24 overflow-y-auto leading-relaxed">
                {updateInfo.body}
              </p>
            </div>
          )}

          {/* Download progress bar */}
          {status === 'downloading' && (
            <div className="space-y-1.5 pt-1" data-testid="download-progress-container">
              <div className="flex justify-between text-[11px] font-semibold text-on-surface">
                <span>{t('settings.updates.downloading')}</span>
                <span>{progress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-surface rounded-full overflow-hidden border border-white/10">
                <div
                  className="h-full bg-brand-primary transition-all duration-200 rounded-full"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="flex flex-col gap-2">
          {status === 'available' ? (
            <button
              data-testid="download-update-button"
              onClick={installUpdate}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 py-2.5 text-xs font-bold text-brand-on-primary transition-all hover:opacity-90 cursor-pointer shadow-lg shadow-brand-primary/20"
            >
              <Download className="w-4 h-4" />
              <span>{t('settings.updates.downloadAndInstall')}</span>
            </button>
          ) : status === 'downloaded' ? (
            <button
              data-testid="restart-app-button"
              onClick={restartNow}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition-all hover:bg-emerald-500 cursor-pointer shadow-lg shadow-emerald-600/20"
            >
              <RotateCw className="w-4 h-4" />
              <span>{t('settings.updates.restartNow')}</span>
            </button>
          ) : (
            <button
              data-testid="check-updates-button"
              onClick={checkForUpdates}
              disabled={status === 'checking' || status === 'downloading' || !supported}
              className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-surface border border-white/10 hover:border-brand-primary/50 hover:bg-surface-elevated px-4 py-2.5 text-xs font-semibold text-on-surface transition-all disabled:opacity-50 cursor-pointer"
            >
              {status === 'checking' ? (
                <RefreshCw className="w-4 h-4 animate-spin text-brand-primary" />
              ) : (
                <RefreshCw className="w-4 h-4 text-on-surface-variant" />
              )}
              <span>
                {status === 'checking'
                  ? t('settings.updates.checking')
                  : t('settings.updates.checkNow')}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Error message */}
      {status === 'error' && displayErrorMessage && (
        <div
          data-testid="update-error-message"
          className="flex items-start gap-2 rounded-lg border border-brand-error/20 bg-brand-error/10 p-3 text-xs text-brand-error"
        >
          <AlertCircle className="mt-0.5 w-3.5 h-3.5 shrink-0" />
          <span>
            {t('settings.updates.error')}: {displayErrorMessage}
          </span>
        </div>
      )}
    </div>
  );
}
