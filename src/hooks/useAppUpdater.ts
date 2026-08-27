/**
 * @file useAppUpdater.ts
 * @description React hook for checking and installing desktop app updates.
 *
 * @license Apache-2.0
 */

import { useState, useCallback } from 'react';
import {
  checkAppUpdate,
  downloadAndApplyUpdate,
  restartApplication,
  type AppUpdateInfo,
  type UpdateDownloadProgress,
} from '../lib/updater';
import { isDesktopAppUpdaterSupported } from '../lib/environment';

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'upToDate'
  | 'error';

export interface UseAppUpdaterResult {
  status: UpdaterStatus;
  supported: boolean;
  updateInfo: AppUpdateInfo | null;
  progress: UpdateDownloadProgress;
  errorMessage: string | null;
  errorKey: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  restartNow: () => Promise<void>;
}

export function useAppUpdater(): UseAppUpdaterResult {
  const [status, setStatus] = useState<UpdaterStatus>('idle');
  const [supported, setSupported] = useState<boolean>(() => isDesktopAppUpdaterSupported());
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [progress, setProgress] = useState<UpdateDownloadProgress>({ downloaded: 0, percent: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    setStatus('checking');
    setErrorMessage(null);
    setErrorKey(null);

    const result = await checkAppUpdate();
    setSupported(result.supported);

    if (!result.supported) {
      setStatus('idle');
      return;
    }

    if (result.error) {
      setStatus('error');
      setErrorMessage(result.error);
      setErrorKey(result.errorKey || null);
      return;
    }

    if (result.hasUpdate && result.updateInfo) {
      setUpdateInfo(result.updateInfo);
      setStatus('available');
    } else {
      setUpdateInfo(null);
      setStatus('upToDate');
    }
  }, []);

  const installUpdate = useCallback(async () => {
    setStatus('downloading');
    setErrorMessage(null);
    setErrorKey(null);
    setProgress({ downloaded: 0, percent: 0 });

    const result = await downloadAndApplyUpdate((p) => {
      setProgress(p);
    });

    if (result.success) {
      setStatus('downloaded');
    } else {
      setStatus('error');
      setErrorMessage(result.error || 'Failed to install update.');
    }
  }, []);

  const restartNow = useCallback(async () => {
    await restartApplication();
  }, []);

  return {
    status,
    supported,
    updateInfo,
    progress,
    errorMessage,
    errorKey,
    checkForUpdates,
    installUpdate,
    restartNow,
  };
}
