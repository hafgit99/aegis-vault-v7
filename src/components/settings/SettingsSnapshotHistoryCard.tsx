/**
 * @file SettingsSnapshotHistoryCard.tsx
 * @description UI Component rendering the Vault Snapshot History interface in Settings.
 * Displays versioned encrypted snapshots, creation actions, retention stats,
 * automatic snapshot configuration, and seamless point-in-time recovery with automatic safety pre-snapshots.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  History,
  Calendar,
  Camera,
  RotateCcw,
  Trash2,
  Download,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  Sparkles,
  Layers,
  FileCheck,
  Settings as SettingsIcon,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useVaultSnapshots } from '../../hooks/useVaultSnapshots';
import type { VaultSnapshotRecord, SnapshotFrequency } from '../../lib/snapshots';

interface SettingsSnapshotHistoryCardProps {
  onDatabaseChanged?: () => void | Promise<void>;
  onNotify?: (message: string, kind?: 'info' | 'error' | 'success') => void;
}

export function SettingsSnapshotHistoryCard({
  onDatabaseChanged,
  onNotify,
}: SettingsSnapshotHistoryCardProps) {
  const { t } = useLanguage();
  const {
    snapshots,
    loading,
    busy,
    settings,
    handleUpdateSettings,
    successMessage,
    errorMessage,
    confirmRestoreSnapshot,
    setConfirmRestoreSnapshot,
    handleCreateSnapshot,
    handleRestoreSnapshot,
    handleDeleteSnapshot,
    handleClearAll,
    handleExportSnapshot,
  } = useVaultSnapshots({ onDatabaseChanged, onNotify });

  const [customLabel, setCustomLabel] = useState('');
  const [showLabelInput, setShowLabelInput] = useState(false);
  const [showAutoSettings, setShowAutoSettings] = useState(false);

  const formatSnapshotDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  const getTriggerBadge = (trigger: VaultSnapshotRecord['trigger']) => {
    switch (trigger) {
      case 'manual':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-primary/15 text-brand-primary border border-brand-primary/30">
            <Sparkles className="w-2.5 h-2.5" />
            {t('settings.snapshot.triggerManual')}
          </span>
        );
      case 'pre_restore':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <ShieldCheck className="w-2.5 h-2.5" />
            {t('settings.snapshot.triggerPreRestore')}
          </span>
        );
      case 'auto':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
            <Clock className="w-2.5 h-2.5" />
            {t('settings.snapshot.triggerAuto')}
          </span>
        );
    }
  };

  const onConfirmCreate = async () => {
    const success = await handleCreateSnapshot(customLabel.trim() || undefined);
    if (success) {
      setCustomLabel('');
      setShowLabelInput(false);
    }
  };

  return (
    <div
      className="glass-panel p-4 sm:p-6 rounded-2xl flex flex-col space-y-4"
      id="vault-snapshot-history-card"
      data-testid="vault-snapshot-history-card"
    >
      {/* Header and Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-outline-variant/10 pb-3">
        <div className="space-y-1">
          <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-brand-primary" />
            <span>{t('settings.snapshot.title')}</span>
          </h3>
          <p className="text-xs text-on-surface-variant leading-relaxed">
            {t('settings.snapshot.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-surface-lowest text-on-surface-variant border border-outline-variant/30">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            {t('settings.snapshot.badgeEncrypted')}
          </span>
          <span className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-surface-lowest text-on-surface-variant border border-outline-variant/30">
            <Layers className="w-3 h-3 text-brand-primary" />
            {t('settings.snapshot.badgeLocal')}
          </span>

          {/* Auto Settings Toggle Button */}
          <button
            type="button"
            data-testid="auto-settings-toggle-btn"
            onClick={() => setShowAutoSettings(!showAutoSettings)}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold text-xs rounded-lg border transition-all shadow-xs ${
              showAutoSettings
                ? 'bg-brand-primary text-brand-on-primary border-brand-primary shadow-sm'
                : 'bg-surface-low hover:bg-surface-high text-on-surface border-outline-variant/50'
            }`}
            title={t('settings.snapshot.autoSettingsBtn')}
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('settings.snapshot.autoSettingsBtn')}</span>
            {showAutoSettings ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {/* Take Manual Snapshot Button */}
          <button
            type="button"
            data-testid="create-snapshot-button"
            disabled={busy}
            onClick={() => setShowLabelInput(!showLabelInput)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-brand-on-primary font-bold text-xs rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>{t('settings.snapshot.createButton')}</span>
          </button>
        </div>
      </div>

      {/* Expandable Auto Snapshot Settings Panel */}
      {showAutoSettings && (
        <div
          data-testid="auto-settings-panel"
          className="p-4 rounded-xl bg-surface-lowest/80 border border-outline-variant/30 space-y-4 animate-in fade-in duration-150"
        >
          <div className="flex items-center justify-between border-b border-outline-variant/15 pb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-brand-primary" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-on-surface">
                {t('settings.snapshot.autoSettingsTitle')}
              </h4>
            </div>
            {settings.lastAutoSnapshotTime ? (
              <span
                data-testid="last-auto-snapshot-badge"
                className="text-[11px] text-on-surface-variant flex items-center gap-1"
              >
                <span>{t('settings.snapshot.lastAutoSnapshot')}:</span>
                <span className="font-medium text-on-surface">
                  {formatSnapshotDate(settings.lastAutoSnapshotTime)}
                </span>
              </span>
            ) : (
              <span
                data-testid="last-auto-snapshot-badge"
                className="text-[11px] text-on-surface-variant/70 italic"
              >
                {t('settings.snapshot.noAutoSnapshotYet')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Setting 1: Auto Enable Switch */}
            <div className="flex flex-col justify-between p-3 rounded-lg bg-surface-low border border-outline-variant/20 space-y-2">
              <div>
                <span className="text-xs font-semibold text-on-surface block">
                  {t('settings.snapshot.autoEnabled')}
                </span>
                <span className="text-[11px] text-on-surface-variant leading-tight block mt-0.5">
                  {t('settings.snapshot.autoEnabledDesc')}
                </span>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  data-testid="auto-enabled-toggle"
                  onClick={() => handleUpdateSettings({ autoEnabled: !settings.autoEnabled })}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-inner ${
                    settings.autoEnabled
                      ? 'bg-emerald-600 dark:bg-emerald-500 ring-2 ring-emerald-400/40 shadow-emerald-950/20'
                      : 'bg-zinc-300 dark:bg-zinc-700 border-2 border-zinc-400/60 dark:border-zinc-600'
                  }`}
                  aria-pressed={settings.autoEnabled}
                >
                  <span
                    className={`pointer-events-none inline-flex h-5 w-5 transform items-center justify-center rounded-full shadow-md ring-1 ring-black/20 transition-all duration-200 ease-in-out ${
                      settings.autoEnabled
                        ? 'translate-x-5 bg-white text-emerald-600'
                        : 'translate-x-0.5 bg-zinc-100 dark:bg-zinc-200 text-zinc-400'
                    }`}
                  >
                    {settings.autoEnabled ? (
                      <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.5]" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
                    )}
                  </span>
                </button>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    settings.autoEnabled
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-zinc-200/80 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      settings.autoEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'
                    }`}
                  />
                  {settings.autoEnabled ? t('settings.snapshot.statusEnabled') : t('settings.snapshot.statusDisabled')}
                </span>
              </div>
            </div>

            {/* Setting 2: Frequency Selector */}
            <div className="flex flex-col justify-between p-3 rounded-lg bg-surface-low border border-outline-variant/20 space-y-2">
              <div>
                <span className="text-xs font-semibold text-on-surface block">
                  {t('settings.snapshot.frequency')}
                </span>
                <span className="text-[11px] text-on-surface-variant leading-tight block mt-0.5">
                  {t('settings.snapshot.frequencyDesc')}
                </span>
              </div>
              <div>
                <select
                  data-testid="auto-frequency-select"
                  disabled={!settings.autoEnabled}
                  value={settings.frequency}
                  onChange={(e) =>
                    handleUpdateSettings({ frequency: e.target.value as SnapshotFrequency })
                  }
                  className="w-full text-xs bg-surface-lowest text-on-surface border border-outline-variant/40 rounded-lg px-2.5 py-1.5 focus:border-brand-primary focus:outline-none disabled:opacity-40"
                >
                  <option value="on_lock">{t('settings.snapshot.freqOnLock')}</option>
                  <option value="daily">{t('settings.snapshot.freqDaily')}</option>
                  <option value="weekly">{t('settings.snapshot.freqWeekly')}</option>
                </select>
              </div>
            </div>

            {/* Setting 3: Retention Limit Selector */}
            <div className="flex flex-col justify-between p-3 rounded-lg bg-surface-low border border-outline-variant/20 space-y-2">
              <div>
                <span className="text-xs font-semibold text-on-surface block">
                  {t('settings.snapshot.retentionLimit')}
                </span>
                <span className="text-[11px] text-on-surface-variant leading-tight block mt-0.5">
                  {t('settings.snapshot.retentionLimitDesc')}
                </span>
              </div>
              <div>
                <select
                  data-testid="auto-retention-select"
                  value={settings.maxSnapshots}
                  onChange={(e) =>
                    handleUpdateSettings({ maxSnapshots: parseInt(e.target.value, 10) })
                  }
                  className="w-full text-xs bg-surface-lowest text-on-surface border border-outline-variant/40 rounded-lg px-2.5 py-1.5 focus:border-brand-primary focus:outline-none"
                >
                  <option value={10}>{t('settings.snapshot.retentionCount', { count: 10 })}</option>
                  <option value={20}>{t('settings.snapshot.retentionCount', { count: 20 })}</option>
                  <option value={30}>{t('settings.snapshot.retentionCount', { count: 30 })}</option>
                  <option value={50}>{t('settings.snapshot.retentionCount', { count: 50 })}</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual Label Input Form Drawer */}
      {showLabelInput && (
        <div
          data-testid="snapshot-label-drawer"
          className="p-3 rounded-xl bg-surface-lowest/90 border border-brand-primary/30 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 animate-in fade-in duration-150"
        >
          <input
            type="text"
            data-testid="snapshot-label-input"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onConfirmCreate();
              if (e.key === 'Escape') setShowLabelInput(false);
            }}
            placeholder={t('settings.snapshot.labelPlaceholder')}
            maxLength={60}
            className="flex-1 text-xs bg-surface-lowest text-on-surface px-3 py-1.5 rounded-lg border border-outline-variant/40 focus:border-brand-primary focus:outline-none"
            autoFocus
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              data-testid="snapshot-label-cancel"
              onClick={() => setShowLabelInput(false)}
              className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {t('settings.snapshot.cancel')}
            </button>
            <button
              type="button"
              data-testid="snapshot-label-submit"
              disabled={busy}
              onClick={onConfirmCreate}
              className="px-3 py-1.5 text-xs bg-brand-primary text-brand-on-primary font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {busy ? t('settings.snapshot.creating') : t('settings.snapshot.saveButton')}
            </button>
          </div>
        </div>
      )}

      {/* Inline Feedback Alerts */}
      {successMessage && (
        <div
          data-testid="snapshot-success-alert"
          className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div
          data-testid="snapshot-error-alert"
          className="flex items-center gap-2 p-2.5 rounded-lg bg-brand-error/10 border border-brand-error/30 text-brand-error text-xs"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Snapshots List Area */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center space-y-2 text-on-surface-variant text-xs">
          <RotateCcw className="w-5 h-5 animate-spin text-brand-primary" />
          <span>{t('settings.snapshot.loading')}</span>
        </div>
      ) : snapshots.length === 0 ? (
        <div
          data-testid="snapshot-empty-state"
          className="py-8 px-4 rounded-xl border border-dashed border-outline-variant/30 flex flex-col items-center justify-center text-center space-y-2 bg-surface-lowest/40"
        >
          <History className="w-8 h-8 text-on-surface-variant/40" />
          <p className="text-xs font-semibold text-on-surface">
            {t('settings.snapshot.emptyTitle')}
          </p>
          <p className="text-[11px] text-on-surface-variant max-w-sm">
            {t('settings.snapshot.emptyDesc')}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {snapshots.map((snap) => (
            <div
              key={snap.id}
              data-testid={`snapshot-item-${snap.id}`}
              className="p-3 rounded-xl bg-surface-lowest/70 border border-outline-variant/20 hover:border-brand-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              {/* Left Details */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-xs text-on-surface">
                    {snap.label || t('settings.snapshot.defaultLabel')}
                  </span>
                  {getTriggerBadge(snap.trigger)}
                  <span className="text-[10px] text-on-surface-variant font-mono">
                    {snap.checksum.slice(0, 8)}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {formatSnapshotDate(snap.createdAt)}
                  </span>
                  <span>•</span>
                  <span>{t('settings.snapshot.itemsCount', { count: snap.itemCount })}</span>
                  {snap.attachmentCount > 0 && (
                    <>
                      <span>•</span>
                      <span>{t('settings.snapshot.attachmentsCount', { count: snap.attachmentCount })}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatSize(snap.sizeBytes)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                {/* Restore Snapshot */}
                <button
                  type="button"
                  data-testid={`restore-snapshot-${snap.id}`}
                  disabled={busy}
                  onClick={() => setConfirmRestoreSnapshot(snap)}
                  className="px-2.5 py-1.5 bg-surface-low hover:bg-brand-primary/20 text-on-surface hover:text-brand-primary rounded-lg border border-outline-variant/30 text-xs font-semibold flex items-center gap-1 transition-all disabled:opacity-50"
                  title={t('settings.snapshot.restoreButton')}
                >
                  <RotateCcw className="w-3 h-3 text-brand-primary" />
                  <span>{t('settings.snapshot.restoreButton')}</span>
                </button>

                {/* Export Snapshot File */}
                <button
                  type="button"
                  data-testid={`export-snapshot-${snap.id}`}
                  disabled={busy}
                  onClick={() => handleExportSnapshot(snap)}
                  className="p-1.5 hover:bg-surface-high text-on-surface-variant hover:text-on-surface rounded-lg border border-outline-variant/20 transition-all disabled:opacity-50"
                  title={t('settings.snapshot.exportButton')}
                >
                  <Download className="w-3.5 h-3.5" />
                </button>

                {/* Delete Snapshot */}
                <button
                  type="button"
                  data-testid={`delete-snapshot-${snap.id}`}
                  disabled={busy}
                  onClick={() => handleDeleteSnapshot(snap.id)}
                  className="p-1.5 hover:bg-brand-error/15 text-on-surface-variant hover:text-brand-error rounded-lg border border-outline-variant/20 transition-all disabled:opacity-50"
                  title={t('settings.snapshot.deleteButton')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer Info & Retention / Clear Actions */}
      <div className="pt-2 border-t border-outline-variant/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-on-surface-variant">
        <span className="flex items-center gap-1 leading-relaxed">
          <FileCheck className="w-3 h-3 text-emerald-400 shrink-0" />
          <span>{t('settings.snapshot.retentionInfo')}</span>
        </span>

        {snapshots.length > 0 && (
          <button
            type="button"
            data-testid="clear-all-snapshots-btn"
            disabled={busy}
            onClick={() => {
              if (window.confirm(t('settings.snapshot.confirmClearAll'))) {
                handleClearAll();
              }
            }}
            className="text-brand-error hover:underline text-[11px] self-end sm:self-auto shrink-0"
          >
            {t('settings.snapshot.clearAllButton')}
          </button>
        )}
      </div>

      {/* Confirmation Modal for Restore */}
      {confirmRestoreSnapshot && (
        <div
          data-testid="confirm-restore-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in"
        >
          <div className="glass-panel max-w-md w-full p-5 rounded-2xl space-y-4 border border-brand-primary/30 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-on-surface">
                {t('settings.snapshot.confirmRestoreTitle')}
              </h4>
            </div>

            <p className="text-xs text-on-surface-variant leading-relaxed">
              {t('settings.snapshot.confirmRestoreDesc')}
            </p>

            <div className="p-3 rounded-xl bg-surface-lowest/90 border border-outline-variant/20 space-y-1 text-xs">
              <div className="font-semibold text-on-surface">
                {confirmRestoreSnapshot.label || t('settings.snapshot.defaultLabel')}
              </div>
              <div className="text-[11px] text-on-surface-variant flex items-center gap-2">
                <span>{formatSnapshotDate(confirmRestoreSnapshot.createdAt)}</span>
                <span>•</span>
                <span>{t('settings.snapshot.itemsCount', { count: confirmRestoreSnapshot.itemCount })}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                data-testid="confirm-restore-cancel"
                disabled={busy}
                onClick={() => setConfirmRestoreSnapshot(null)}
                className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
              >
                {t('settings.snapshot.confirmRestoreCancel')}
              </button>
              <button
                type="button"
                data-testid="confirm-restore-submit"
                disabled={busy}
                onClick={() => handleRestoreSnapshot(confirmRestoreSnapshot)}
                className="px-4 py-1.5 text-xs bg-brand-primary text-brand-on-primary font-bold rounded-lg hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {busy && <RotateCcw className="w-3 h-3 animate-spin" />}
                <span>{t('settings.snapshot.confirmRestoreSubmit')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
