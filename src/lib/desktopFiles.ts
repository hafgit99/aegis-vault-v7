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
const androidSaveRequests = new Map<string, { resolve: (saved: boolean) => void; reject: (error: Error) => void }>();
const androidOpenRequests = new Map<string, { resolve: (file: DesktopImportFile | null) => void; reject: (error: Error) => void }>();

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
    androidSaveRequests.set(requestId, { resolve, reject });
    bridge.saveTextFile(requestId, defaultFilename, mimeTypeForExport(defaultFilename), contents);
  });
}

function saveAndroidBase64File(defaultFilename: string, contentsBase64: string): Promise<boolean> {
  const bridge = ensureAndroidFileBridge();
  if (!bridge) {
    return Promise.reject(new Error('Android file picker is not available.'));
  }

  const requestId = nextAndroidFileRequestId();
  return new Promise((resolve, reject) => {
    androidSaveRequests.set(requestId, { resolve, reject });
    bridge.saveBase64File(requestId, defaultFilename, 'application/octet-stream', contentsBase64);
  });
}

function openAndroidTextFile(): Promise<DesktopImportFile | null> {
  const bridge = ensureAndroidFileBridge();
  if (!bridge) {
    return Promise.reject(new Error('Android file picker is not available.'));
  }

  const requestId = nextAndroidFileRequestId();
  return new Promise((resolve, reject) => {
    androidOpenRequests.set(requestId, { resolve, reject });
    bridge.openTextFile(requestId);
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
