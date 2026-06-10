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

export async function openDesktopImportFile(): Promise<DesktopImportFile | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<DesktopImportFile | null>('open_import_file');
}

