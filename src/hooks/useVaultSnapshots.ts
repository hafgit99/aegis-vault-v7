/**
 * @file useVaultSnapshots.ts
 * @description React hook orchestrating the Vault Snapshot History workflow:
 * loading, manual capture, automated settings, restoring, deleting, and exporting encrypted snapshots.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../i18n/LanguageContext';
import {
  getVaultSnapshots,
  createVaultSnapshot,
  restoreVaultSnapshot,
  deleteVaultSnapshot,
  clearAllVaultSnapshots,
  exportVaultSnapshotToFile,
  getSnapshotSettings,
  saveSnapshotSettings,
  checkAndTriggerAutoSnapshot,
  type VaultSnapshotRecord,
  type SnapshotSettings,
  SnapshotError,
} from '../lib/snapshots';

interface UseVaultSnapshotsOptions {
  onDatabaseChanged?: () => void | Promise<void>;
  onNotify?: (message: string, kind?: 'info' | 'error' | 'success') => void;
}

export function useVaultSnapshots(options?: UseVaultSnapshotsOptions) {
  const { t } = useLanguage();
  const [snapshots, setSnapshots] = useState<VaultSnapshotRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmRestoreSnapshot, setConfirmRestoreSnapshot] = useState<VaultSnapshotRecord | null>(null);
  const [settings, setSettings] = useState<SnapshotSettings>(getSnapshotSettings);

  const loadSnapshots = useCallback(async () => {
    try {
      const records = await getVaultSnapshots();
      setSnapshots(records);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSnapshots();
  }, [loadSnapshots]);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    options?.onNotify?.(msg, 'success');
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setSuccessMessage(null);
    options?.onNotify?.(msg, 'error');
  };

  const handleUpdateSettings = (patch: Partial<SnapshotSettings>) => {
    try {
      const updated = saveSnapshotSettings(patch);
      setSettings(updated);
      showSuccess(t('settings.snapshot.settingsSaved'));
      if (patch.maxSnapshots !== undefined) {
        loadSnapshots();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.snapshot.errorFallback');
      showError(msg);
    }
  };

  const handleCreateSnapshot = async (label?: string): Promise<boolean> => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await createVaultSnapshot('manual', label);
      await loadSnapshots();
      showSuccess(t('settings.snapshot.createSuccess'));
      return true;
    } catch (err: unknown) {
      if (err instanceof SnapshotError && err.code === 'snapshots.sessionLocked') {
        showError(t('settings.snapshot.errorLocked'));
      } else {
        const msg = err instanceof Error ? err.message : t('settings.snapshot.errorFallback');
        showError(msg);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreSnapshot = async (snapshot: VaultSnapshotRecord): Promise<boolean> => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const result = await restoreVaultSnapshot(snapshot.id);
      await loadSnapshots();
      if (options?.onDatabaseChanged) {
        await options.onDatabaseChanged();
      }
      showSuccess(t('settings.snapshot.restoreSuccess', { count: result.restoredItems }));
      setConfirmRestoreSnapshot(null);
      return true;
    } catch (err: unknown) {
      if (err instanceof SnapshotError && err.code === 'snapshots.sessionLocked') {
        showError(t('settings.snapshot.errorLocked'));
      } else {
        const msg = err instanceof Error ? err.message : t('settings.snapshot.errorFallback');
        showError(msg);
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSnapshot = async (id: string): Promise<boolean> => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await deleteVaultSnapshot(id);
      await loadSnapshots();
      showSuccess(t('settings.snapshot.deleteSuccess'));
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.snapshot.errorFallback');
      showError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async (): Promise<boolean> => {
    setBusy(true);
    setErrorMessage(null);
    try {
      await clearAllVaultSnapshots();
      await loadSnapshots();
      showSuccess(t('settings.snapshot.clearAllSuccess'));
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.snapshot.errorFallback');
      showError(msg);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleExportSnapshot = async (snapshot: VaultSnapshotRecord): Promise<boolean> => {
    try {
      const success = await exportVaultSnapshotToFile(snapshot);
      if (success) {
        showSuccess(t('settings.snapshot.exportSuccess'));
      }
      return success;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('settings.snapshot.errorFallback');
      showError(msg);
      return false;
    }
  };

  return {
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
    refreshSnapshots: loadSnapshots,
  };
}
