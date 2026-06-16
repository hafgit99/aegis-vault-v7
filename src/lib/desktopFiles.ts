import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './desktopStorage';

export interface DesktopImportFile {
  name: string;
  contents: string;
}

export async function saveDesktopExportFile(defaultFilename: string, contents: string): Promise<boolean> {
  if (!isDesktopRuntime()) return false;
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
  if (!isDesktopRuntime()) return false;
  return invoke<boolean>('save_binary_file', {
    defaultFilename,
    contentsBase64: bytesToBase64(bytes),
  });
}

export async function openDesktopImportFile(): Promise<DesktopImportFile | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<DesktopImportFile | null>('open_import_file');
}
