/**
 * @file updater.ts
 * @description Safe Tauri v2 Auto-Updater service for Aegis Vault 7.
 * Provides check, download, verification, and restart routines with fallback for web/mobile.
 *
 * @license Apache-2.0
 */

import { check, type Update, type DownloadEvent } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './environment';

export interface AppUpdateInfo {
  currentVersion: string;
  version: string;
  body?: string;
  date?: string;
}

export interface UpdateDownloadProgress {
  total?: number;
  downloaded: number;
  percent: number;
}

let activeUpdateInstance: Update | null = null;

/**
 * Checks if a newer version of the desktop application is available on the update endpoint.
 */
export async function checkAppUpdate(): Promise<{
  supported: boolean;
  hasUpdate: boolean;
  updateInfo?: AppUpdateInfo;
  error?: string;
}> {
  if (!isDesktopRuntime()) {
    return { supported: false, hasUpdate: false };
  }

  try {
    const update = await check();
    if (!update) {
      activeUpdateInstance = null;
      return { supported: true, hasUpdate: false };
    }

    activeUpdateInstance = update;
    return {
      supported: true,
      hasUpdate: true,
      updateInfo: {
        currentVersion: update.currentVersion,
        version: update.version,
        body: update.body,
        date: update.date,
      },
    };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      supported: true,
      hasUpdate: false,
      error: errorMessage,
    };
  }
}

/**
 * Downloads and installs the pending update.
 */
export async function downloadAndApplyUpdate(
  onProgress?: (progress: UpdateDownloadProgress) => void
): Promise<{ success: boolean; error?: string }> {
  if (!isDesktopRuntime()) {
    return { success: false, error: 'Updater is only available on desktop.' };
  }

  try {
    let update = activeUpdateInstance;
    if (!update) {
      const checkResult = await check();
      if (!checkResult) {
        return { success: false, error: 'No update available to download.' };
      }
      update = checkResult;
      activeUpdateInstance = update;
    }

    let totalBytes = 0;
    let downloadedBytes = 0;

    await update.downloadAndInstall((event: DownloadEvent) => {
      if (event.event === 'Started') {
        totalBytes = event.data.contentLength ?? 0;
        downloadedBytes = 0;
        onProgress?.({
          total: totalBytes,
          downloaded: 0,
          percent: 0,
        });
      } else if (event.event === 'Progress') {
        downloadedBytes += event.data.chunkLength;
        const percent = totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0;
        onProgress?.({
          total: totalBytes,
          downloaded: downloadedBytes,
          percent,
        });
      } else if (event.event === 'Finished') {
        onProgress?.({
          total: totalBytes,
          downloaded: totalBytes || downloadedBytes,
          percent: 100,
        });
      }
    });

    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMessage };
  }
}

/**
 * Restarts the application to complete the update installation.
 */
export async function restartApplication(): Promise<void> {
  if (!isDesktopRuntime()) {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
    return;
  }

  try {
    await invoke('restart_app');
  } catch (error) {
    console.error('Failed to restart app via tauri command:', error);
  }
}
