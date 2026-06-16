// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDesktopImportFile, saveDesktopBinaryFile, saveDesktopExportFile } from './desktopFiles';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe('desktopFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete window.__TAURI_INTERNALS__;
  });

  it('uses web fallback outside the desktop runtime', async () => {
    await expect(saveDesktopExportFile('backup.aegis', 'payload')).resolves.toBe(false);
    await expect(saveDesktopBinaryFile('secret.bin', new Uint8Array([1, 2, 3]))).resolves.toBe(false);
    await expect(openDesktopImportFile()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('invokes native file commands inside the desktop runtime', async () => {
    window.__TAURI_INTERNALS__ = {};
    invoke
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({ name: 'backup.json', contents: '[{"title":"GitHub"}]' });

    await expect(saveDesktopExportFile('backup.aegis', 'payload')).resolves.toBe(true);
    await expect(saveDesktopBinaryFile('secret.bin', new Uint8Array([1, 2, 3]))).resolves.toBe(true);
    await expect(openDesktopImportFile()).resolves.toEqual({
      name: 'backup.json',
      contents: '[{"title":"GitHub"}]',
    });

    expect(invoke).toHaveBeenNthCalledWith(1, 'save_export_file', {
      defaultFilename: 'backup.aegis',
      contents: 'payload',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'save_binary_file', {
      defaultFilename: 'secret.bin',
      contentsBase64: 'AQID',
    });
    expect(invoke).toHaveBeenNthCalledWith(3, 'open_import_file');
  });
});
