import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './desktopStorage';

export interface DesktopImportFile {
  name: string;
  contents: string;
}

declare global {
  interface Window {
    AegisAndroidFiles?: {
      saveTextFile(requestId: string, defaultFilename: string, mimeType: string, contents: string): void;
      saveBase64File(requestId: string, defaultFilename: string, mimeType: string, contentsBase64: string): void;
      openTextFile(requestId: string): void;
    };
    __aegisAndroidFiles?: {
      resolveSave(requestId: string, saved: boolean, error?: string | null): void;
      resolveOpen(requestId: string, file?: DesktopImportFile | null, error?: string | null): void;
    };
  }
}

let androidFileRequestCounter = 0;
const ANDROID_FILE_REQUEST_TIMEOUT_MS = 120000;

type AndroidRequestTimeout = ReturnType<typeof setTimeout>;
const androidSaveRequests = new Map<string, {
  resolve: (saved: boolean) => void;
  reject: (error: Error) => void;
  timeout: AndroidRequestTimeout;
}>();
const androidOpenRequests = new Map<string, {
  resolve: (file: DesktopImportFile | null) => void;
  reject: (error: Error) => void;
  timeout: AndroidRequestTimeout;
}>();

function isMobileUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function isAndroidUserAgent(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
}

function isAndroidTauriRuntime(): boolean {
  return isDesktopRuntime() && isAndroidUserAgent();
}

export function isDesktopFileDialogSupported(): boolean {
  return isDesktopRuntime() && !isMobileUserAgent();
}

function isAndroidFileDialogSupported(): boolean {
  return isAndroidTauriRuntime() && typeof window !== 'undefined' && Boolean(window.AegisAndroidFiles);
}

export function isNativeFileDialogSupported(): boolean {
  return isDesktopFileDialogSupported() || isAndroidFileDialogSupported();
}

function ensureAndroidFileBridge(): NonNullable<Window['AegisAndroidFiles']> | null {
  if (typeof window === 'undefined' || !window.AegisAndroidFiles) return null;

  window.__aegisAndroidFiles = {
    resolveSave(requestId, saved, error) {
      const pending = androidSaveRequests.get(requestId);
      if (!pending) return;
      androidSaveRequests.delete(requestId);
      clearTimeout(pending.timeout);
      if (error) {
        pending.reject(new Error(error));
        return;
      }
      pending.resolve(Boolean(saved));
    },
    resolveOpen(requestId, file, error) {
      const pending = androidOpenRequests.get(requestId);
      if (!pending) return;
      androidOpenRequests.delete(requestId);
      clearTimeout(pending.timeout);
      if (error) {
        pending.reject(new Error(error));
        return;
      }
      pending.resolve(file ?? null);
    },
  };

  return window.AegisAndroidFiles;
}

function nextAndroidFileRequestId(): string {
  androidFileRequestCounter += 1;
  return `aegis-file-${Date.now()}-${androidFileRequestCounter}`;
}

function createAndroidFileTimeout<T extends { reject: (error: Error) => void; timeout: AndroidRequestTimeout }>(
  requestId: string,
  pendingRequests: Map<string, T>,
): AndroidRequestTimeout {
  return setTimeout(() => {
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    pendingRequests.delete(requestId);
    pending.reject(new Error('Android file picker did not respond before the safety timeout.'));
  }, ANDROID_FILE_REQUEST_TIMEOUT_MS);
}

function mimeTypeForExport(defaultFilename: string): string {
  if (defaultFilename.toLowerCase().endsWith('.json')) return 'application/json';
  if (defaultFilename.toLowerCase().endsWith('.aegis')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function saveAndroidTextFile(defaultFilename: string, contents: string): Promise<boolean> {
  const bridge = ensureAndroidFileBridge();
  if (!bridge) {
    return Promise.reject(new Error('Android file picker is not available.'));
  }

  const requestId = nextAndroidFileRequestId();
  return new Promise((resolve, reject) => {
    const timeout = createAndroidFileTimeout(requestId, androidSaveRequests);
    androidSaveRequests.set(requestId, { resolve, reject, timeout });
    try {
      bridge.saveTextFile(requestId, defaultFilename, mimeTypeForExport(defaultFilename), contents);
    } catch (error) {
      androidSaveRequests.delete(requestId);
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function saveAndroidBase64File(defaultFilename: string, contentsBase64: string): Promise<boolean> {
  const bridge = ensureAndroidFileBridge();
  if (!bridge) {
    return Promise.reject(new Error('Android file picker is not available.'));
  }

  const requestId = nextAndroidFileRequestId();
  return new Promise((resolve, reject) => {
    const timeout = createAndroidFileTimeout(requestId, androidSaveRequests);
    androidSaveRequests.set(requestId, { resolve, reject, timeout });
    try {
      bridge.saveBase64File(requestId, defaultFilename, 'application/octet-stream', contentsBase64);
    } catch (error) {
      androidSaveRequests.delete(requestId);
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function openAndroidTextFile(): Promise<DesktopImportFile | null> {
  const bridge = ensureAndroidFileBridge();
  if (!bridge) {
    return Promise.reject(new Error('Android file picker is not available.'));
  }

  const requestId = nextAndroidFileRequestId();
  return new Promise((resolve, reject) => {
    const timeout = createAndroidFileTimeout(requestId, androidOpenRequests);
    androidOpenRequests.set(requestId, { resolve, reject, timeout });
    try {
      bridge.openTextFile(requestId);
    } catch (error) {
      androidOpenRequests.delete(requestId);
      clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function saveDesktopExportFile(defaultFilename: string, contents: string): Promise<boolean> {
  if (isAndroidTauriRuntime()) return saveAndroidTextFile(defaultFilename, contents);
  if (!isDesktopFileDialogSupported()) return false;
  return invoke<boolean>('save_export_file', { defaultFilename, contents });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function saveDesktopBinaryFile(defaultFilename: string, bytes: Uint8Array): Promise<boolean> {
  if (isAndroidTauriRuntime()) return saveAndroidBase64File(defaultFilename, bytesToBase64(bytes));
  if (!isDesktopFileDialogSupported()) return false;
  return invoke<boolean>('save_binary_file', {
    defaultFilename,
    contentsBase64: bytesToBase64(bytes),
  });
}

export async function openDesktopImportFile(): Promise<DesktopImportFile | null> {
  if (isAndroidTauriRuntime()) return openAndroidTextFile();
  if (!isDesktopFileDialogSupported()) return null;
  return invoke<DesktopImportFile | null>('open_import_file');
}
