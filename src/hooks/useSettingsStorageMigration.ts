/**
 * @file useSettingsStorageMigration.ts
 * @description Owns the wa-sqlite storage-backend migration state and flow.
 * Extracted from SettingsPanel.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import { migrateActiveVaultStorageToWaSqlite } from '../lib/storage';
import { isAndroidRuntime } from '../lib/desktopStorage';
import type { AppNotification } from '../types';

interface UseSettingsStorageMigrationOptions {
  onDatabaseChanged: () => void | Promise<void>;
  onNotify?: (notification: AppNotification) => void;
}

export function useSettingsStorageMigration({
  onDatabaseChanged,
  onNotify,
}: UseSettingsStorageMigrationOptions) {
  const { t } = useLanguage();
  const [storageMigrationStatus, setStorageMigrationStatus] = useState<'idle' | 'running' | 'promoted' | 'blocked' | 'error'>('idle');
  const [storageMigrationMessage, setStorageMigrationMessage] = useState<string | null>(null);

  const handleWaSqliteMigration = async () => {
    setStorageMigrationMessage(null);
    if (isAndroidRuntime()) {
      setStorageMigrationStatus('error');
      setStorageMigrationMessage(t('settings.storageMigration.androidUnsupported'));
      return;
    }

    const confirmed = window.confirm(t('settings.storageMigration.confirm'));
    if (!confirmed) return;

    setStorageMigrationStatus('running');
    try {
      const result = await migrateActiveVaultStorageToWaSqlite();
      if (result.status === 'promoted') {
        setStorageMigrationStatus('promoted');
        setStorageMigrationMessage(t('settings.storageMigration.promoted'));
        await onDatabaseChanged();
        onNotify?.({ title: t('settings.storageMigration.title'), message: t('settings.storageMigration.promoted'), type: 'success' });
        return;
      }

      setStorageMigrationStatus('blocked');
      const issuePreview = result.issues.slice(0, 3).join(', ');
      setStorageMigrationMessage(
        issuePreview
          ? `${t('settings.storageMigration.blocked')} (${issuePreview})`
          : t('settings.storageMigration.blocked'),
      );
    } catch (err: unknown) {
      setStorageMigrationStatus('error');
      const errMessage = err instanceof Error ? err.message : String(err || '');
      const message = errMessage === 'vault-storage-active-migration-session-required'
        ? t('settings.storageMigration.missingSession')
        : errMessage === 'wa-sqlite-android-webview-wasm-memory-unsupported' || errMessage === 'wa-sqlite-webview-wasm-memory-unsupported'
          ? t('settings.storageMigration.androidUnsupported')
          : `${t('settings.storageMigration.error')}: ${errMessage || t('settings.biometric.genericError')}`;
      setStorageMigrationMessage(message);
    }
  };

  return {
    storageMigrationStatus,
    storageMigrationMessage,
    handleWaSqliteMigration,
  };
}