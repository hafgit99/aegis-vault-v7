/**
 * @file useSettingsSync.ts
 * @description Owns the WebDAV / S3 E2EE cloud-sync settings state and all
 * sync flows: connection test, config save/disable, and the manual sync run.
 * Extracted from SettingsPanel.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

import { useLanguage } from '../i18n/LanguageContext';
import type {
  SyncProviderType} from '../lib/sync';
import {
  getLastSyncTime,
  hasSyncConfig,
  validateWebDavConfig,
  validateS3Config,
  WebDavSyncProvider,
  S3SyncProvider,
  saveSyncConfig,
  clearSyncConfig,
  loadSyncConfig,
  createSyncProvider,
  performSync,
  saveLastSyncTime
} from '../lib/sync';
import { getVaultItems, saveVaultItems } from '../lib/storage';
import { withActiveBackupPassword } from '../lib/vaultSession';

interface UseSettingsSyncOptions {
  onDatabaseChanged: () => void | Promise<void>;
}

export function useSettingsSync({ onDatabaseChanged }: UseSettingsSyncOptions) {
  const { t } = useLanguage();
  const [syncProvider, setSyncProvider] = useState<SyncProviderType>('disabled');
  const [syncUrl, setSyncUrl] = useState('');
  const [syncUsername, setSyncUsername] = useState('');
  const [syncPassword, setSyncPassword] = useState('');

  const [s3Endpoint, setS3Endpoint] = useState('');
  const [s3Region, setS3Region] = useState('');
  const [s3Bucket, setS3Bucket] = useState('');
  const [s3AccessKeyId, setS3AccessKeyId] = useState('');
  const [s3SecretAccessKey, setS3SecretAccessKey] = useState('');

  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error' | 'conflict'>('idle');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncLastAt, setSyncLastAt] = useState<string | null>(null);
  const [syncTestResult, setSyncTestResult] = useState<string | null>(null);
  const [syncTestLoading, setSyncTestLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);

  // Load last sync time and detect saved config on mount
  useEffect(() => {
    setSyncLastAt(getLastSyncTime());
    if (hasSyncConfig()) {
      withActiveBackupPassword(async (backupPassword) => {
        try {
          const config = await loadSyncConfig(backupPassword);
          if (config.type === 'webdav') {
            setSyncProvider('webdav');
            setSyncUrl(config.url);
            setSyncUsername(config.username);
            setSyncPassword(config.password);
          } else if (config.type === 's3') {
            setSyncProvider('s3');
            setS3Endpoint(config.endpoint);
            setS3Region(config.region);
            setS3Bucket(config.bucket);
            setS3AccessKeyId(config.accessKeyId);
            setS3SecretAccessKey(config.secretAccessKey);
          }
        } catch {
          setSyncProvider('disabled');
        }
      });
    }
  }, []);

  const handleSyncTest = async () => {
    if (syncProvider === 'webdav') {
      const err = validateWebDavConfig({ url: syncUrl, username: syncUsername, password: syncPassword });
      if (err) { setSyncTestResult(`❌ ${err}`); return; }
      setSyncTestLoading(true);
      setSyncTestResult(null);
      try {
        const provider = new WebDavSyncProvider(syncUrl, syncUsername, syncPassword);
        await provider.testConnection();
        setSyncTestResult(t('settings.sync.test.success'));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e || '');
        setSyncTestResult(t('settings.sync.test.failed') + (msg ? ` (${msg})` : ''));
      } finally {
        setSyncTestLoading(false);
      }
    } else if (syncProvider === 's3') {
      const err = validateS3Config({
        endpoint: s3Endpoint,
        region: s3Region,
        bucket: s3Bucket,
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      });
      if (err) { setSyncTestResult(`❌ ${err}`); return; }
      setSyncTestLoading(true);
      setSyncTestResult(null);
      try {
        const provider = new S3SyncProvider({
          type: 's3',
          endpoint: s3Endpoint,
          region: s3Region,
          bucket: s3Bucket,
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
        });
        await provider.testConnection();
        setSyncTestResult(t('settings.sync.test.success'));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e || '');
        setSyncTestResult(t('settings.sync.test.failed') + (msg ? ` (${msg})` : ''));
      } finally {
        setSyncTestLoading(false);
      }
    }
  };

  const handleSyncSave = async () => {
    if (syncProvider === 'webdav') {
      const err = validateWebDavConfig({ url: syncUrl, username: syncUsername, password: syncPassword });
      if (err) { setSyncMessage(`Error: ${err}`); return; }
      const saved = await withActiveBackupPassword(async (backupPassword) => {
        await saveSyncConfig({ type: 'webdav', url: syncUrl, username: syncUsername, password: syncPassword }, backupPassword);
        return true;
      });
      if (!saved) return;
      setSyncMessage(t('settings.sync.configure.save'));
    } else if (syncProvider === 's3') {
      const err = validateS3Config({
        endpoint: s3Endpoint,
        region: s3Region,
        bucket: s3Bucket,
        accessKeyId: s3AccessKeyId,
        secretAccessKey: s3SecretAccessKey,
      });
      if (err) { setSyncMessage(`Error: ${err}`); return; }
      const saved = await withActiveBackupPassword(async (backupPassword) => {
        await saveSyncConfig({
          type: 's3',
          endpoint: s3Endpoint,
          region: s3Region,
          bucket: s3Bucket,
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
        }, backupPassword);
        return true;
      });
      if (!saved) return;
      setSyncMessage(t('settings.sync.configure.save'));
    }
  };

  const handleSyncDisable = async () => {
    clearSyncConfig();
    setSyncProvider('disabled');
    setSyncUrl(''); setSyncUsername(''); setSyncPassword('');
    setS3Endpoint(''); setS3Region(''); setS3Bucket(''); setS3AccessKeyId(''); setS3SecretAccessKey('');
    setSyncMessage(null); setSyncStatus('idle');
    clearSyncConfig();
    setSyncProvider('disabled');
    setSyncUrl(''); setSyncUsername(''); setSyncPassword('');
    setSyncMessage(null); setSyncStatus('idle');
  };

  const handleSyncNow = async () => {
    await withActiveBackupPassword(async (backupPassword) => {
      setSyncLoading(true);
      setSyncStatus('syncing');
      setSyncMessage(null);
      try {
        const config = await loadSyncConfig(backupPassword);
        const provider = createSyncProvider(config);
        if (!provider) { setSyncStatus('error'); setSyncMessage(t('settings.sync.error.connection')); return; }
        const localItems = await getVaultItems();
        const result = await performSync(provider, localItems, backupPassword);
        if (result.status === 'error') {
          setSyncStatus('error');
          const code = result.error?.code ?? '';
          if (code.includes('auth')) setSyncMessage(t('settings.sync.error.auth'));
          else if (code.includes('upload')) setSyncMessage(t('settings.sync.error.upload'));
          else if (code.includes('download')) setSyncMessage(t('settings.sync.error.download'));
          else if (code.includes('checksum')) setSyncMessage(t('settings.sync.error.checksum'));
          else setSyncMessage(result.error?.message ?? t('settings.sync.error.connection'));
        } else {
          if (result.mergedItems && result.mergedItems.length > 0) {
            await saveVaultItems(result.mergedItems);
            await onDatabaseChanged();
          }
          const now = new Date().toISOString();
          saveLastSyncTime(now);
          setSyncLastAt(now);
          setSyncStatus(result.conflicts && result.conflicts.length > 0 ? 'conflict' : 'success');
          if (result.mergedCount && result.mergedCount > 0) {
            setSyncMessage(`${result.mergedCount} ${t('settings.sync.mergedItems')}`);
          }
        }
      } catch (e: unknown) {
        setSyncStatus('error');
        const msg = e instanceof Error ? e.message : String(e || '');
        setSyncMessage(msg || t('settings.sync.error.connection'));
      } finally {
        setSyncLoading(false);
      }
    });
  };

  const syncTestSucceeded = syncTestResult === t('settings.sync.test.success');

  return {
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
    syncTestSucceeded,
    onSyncTest: handleSyncTest,
    onSyncSave: handleSyncSave,
    onSyncDisable: handleSyncDisable,
    onSyncNow: handleSyncNow,
  };
}