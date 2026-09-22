/**
 * @file useAutoUpdateCheck.ts
 * @description Hook that silently checks for desktop application updates once per day.
 * When a newer version is available, it surfaces update info for the notification banner.
 *
 * @license Apache-2.0
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  checkAppUpdate,
  downloadAndApplyUpdate,
  restartApplication,
  type AppUpdateInfo,
} from '../lib/updater';
import { isDesktopAppUpdaterSupported } from '../lib/environment';

const LAST_CHECK_KEY = 'aegis_last_auto_update_check';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const STARTUP_DELAY_MS = 5000; // 5 seconds grace period after unlock

export interface UseAutoUpdateCheckResult {
  updateInfo: AppUpdateInfo | null;
  isVisible: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  isReadyToRestart: boolean;
  errorMessage: string | null;
  dismissBanner: () => void;
  applyUpdate: () => Promise<void>;
  restartNow: () => Promise<void>;
}

export function useAutoUpdateCheck(enabled = true): UseAutoUpdateCheckResult {
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isReadyToRestart, setIsReadyToRestart] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (!enabled || hasTriggeredRef.current) return;
    if (!isDesktopAppUpdaterSupported()) return;

    // Check last check timestamp in localStorage
    try {
      const lastCheck = localStorage.getItem(LAST_CHECK_KEY);
      if (lastCheck) {
        const elapsed = Date.now() - parseInt(lastCheck, 10);
        if (elapsed < CHECK_INTERVAL_MS) {
          return;
        }
      }
    } catch {
      // localStorage may fail in restricted sandboxes; proceed with check
    }

    hasTriggeredRef.current = true;

    const timer = setTimeout(async () => {
      try {
        const result = await checkAppUpdate();
        try {
          localStorage.setItem(LAST_CHECK_KEY, Date.now().toString());
        } catch {
          // ignore
        }

        if (result.hasUpdate && result.updateInfo) {
          setUpdateInfo(result.updateInfo);
          setIsVisible(true);
        }
      } catch (err) {
        console.warn('Auto update check encountered non-fatal error:', err);
      }
    }, STARTUP_DELAY_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [enabled]);

  const dismissBanner = useCallback(() => {
    setIsVisible(false);
  }, []);

  const applyUpdate = useCallback(async () => {
    setIsDownloading(true);
    setErrorMessage(null);
    setDownloadProgress(0);

    const result = await downloadAndApplyUpdate((progress) => {
      setDownloadProgress(progress.percent);
    });

    setIsDownloading(false);

    if (result.success) {
      setIsReadyToRestart(true);
    } else {
      setErrorMessage(result.error || 'Update failed');
    }
  }, []);

  const restartNow = useCallback(async () => {
    await restartApplication();
  }, []);

  return {
    updateInfo,
    isVisible,
    isDownloading,
    downloadProgress,
    isReadyToRestart,
    errorMessage,
    dismissBanner,
    applyUpdate,
    restartNow,
  };
}
