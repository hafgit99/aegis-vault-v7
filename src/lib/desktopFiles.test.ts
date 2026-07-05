// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDesktopFileDialogSupported,
  isNativeFileDialogSupported,
  openDesktopImportFile,
  saveDesktopBinaryFile,
  saveDesktopExportFile,
} from './desktopFiles';

const invoke = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe('desktopFiles', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete window.__TAURI_INTERNALS__;
    delete window.AegisAndroidFiles;
    delete window.__aegisAndroidFiles;
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 jsdom',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('falls back to the web file input when the Android Tauri runtime is missing the native file bridge', async () => {
    window.__TAURI_INTERNALS__ = {};
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });

    // No AegisAndroidFiles bridge is registered. The previous behaviour was
    // to take the Android code path and reject every call with
    // "Android file picker is not available.", which made CSV / .aegis
    // imports impossible on Android. We now fall back to the HTML
    // <input type="file"> path so the WebView's stock document picker
    // (ACTION_OPEN_DOCUMENT) is used instead.
    expect(isDesktopFileDialogSupported()).toBe(false);
    expect(isNativeFileDialogSupported()).toBe(false);
    // Export is intentionally not available without the native bridge on
    // Android because there is no <a download> fallback.
    await expect(saveDesktopExportFile('backup.aegis', 'payload')).resolves.toBe(false);
    await expect(saveDesktopBinaryFile('secret.bin', new Uint8Array([1, 2, 3]))).resolves.toBe(false);
    // Import returns null so the caller falls back to the hidden <input>.
    await expect(openDesktopImportFile()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('uses the Android native file bridge inside the Android Tauri runtime', async () => {
    window.__TAURI_INTERNALS__ = {};
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });

    window.AegisAndroidFiles = {
      saveTextFile: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveSave(requestId, true, null)),
      saveBase64File: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveSave(requestId, true, null)),
      openTextFile: vi.fn((requestId) =>
        window.__aegisAndroidFiles?.resolveOpen(requestId, { name: 'backup.json', contents: '[{"title":"GitHub"}]' }, null)
      ),
    };

    expect(isDesktopFileDialogSupported()).toBe(false);
    expect(isNativeFileDialogSupported()).toBe(true);
    await expect(saveDesktopExportFile('backup.aegis', 'payload')).resolves.toBe(true);
    await expect(saveDesktopBinaryFile('secret.bin', new Uint8Array([1, 2, 3]))).resolves.toBe(true);
    await expect(openDesktopImportFile()).resolves.toEqual({
      name: 'backup.json',
      contents: '[{"title":"GitHub"}]',
    });

    expect(window.AegisAndroidFiles.saveTextFile).toHaveBeenCalledWith(
      expect.stringMatching(/^aegis-file-/),
      'backup.aegis',
      'application/octet-stream',
      'payload'
    );
    expect(window.AegisAndroidFiles.saveBase64File).toHaveBeenCalledWith(
      expect.stringMatching(/^aegis-file-/),
      'secret.bin',
      'application/octet-stream',
      'AQID'
    );
    expect(window.AegisAndroidFiles.openTextFile).toHaveBeenCalledWith(expect.stringMatching(/^aegis-file-/));
    expect(invoke).not.toHaveBeenCalled();
  });

  it('propagates Android file picker save and open errors', async () => {
    window.__TAURI_INTERNALS__ = {};
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });

    window.AegisAndroidFiles = {
      saveTextFile: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveSave(requestId, false, 'Save failed')),
      saveBase64File: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveSave(requestId, false, 'Binary save failed')),
      openTextFile: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveOpen(requestId, null, 'Open failed')),
    };

    await expect(saveDesktopExportFile('backup.aegis', 'payload')).rejects.toThrow('Save failed');
    await expect(saveDesktopBinaryFile('secret.bin', new Uint8Array([1, 2, 3]))).rejects.toThrow('Binary save failed');
    await expect(openDesktopImportFile()).rejects.toThrow('Open failed');
  });

  it('resolves Android file picker cancellation without falling back to invisible browser writes', async () => {
    window.__TAURI_INTERNALS__ = {};
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });

    window.AegisAndroidFiles = {
      saveTextFile: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveSave(requestId, false, null)),
      saveBase64File: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveSave(requestId, false, null)),
      openTextFile: vi.fn((requestId) => window.__aegisAndroidFiles?.resolveOpen(requestId, null, null)),
    };

    await expect(saveDesktopExportFile('backup.aegis', 'payload')).resolves.toBe(false);
    await expect(saveDesktopBinaryFile('secret.bin', new Uint8Array([1, 2, 3]))).resolves.toBe(false);
    await expect(openDesktopImportFile()).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('times out Android file picker requests that never call back', async () => {
    vi.useFakeTimers();
    window.__TAURI_INTERNALS__ = {};
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14) AegisVault',
    });

    window.AegisAndroidFiles = {
      saveTextFile: vi.fn(),
      saveBase64File: vi.fn(),
      openTextFile: vi.fn(),
    };

    const exportExpectation = expect(saveDesktopExportFile('backup.aegis', 'payload')).rejects.toThrow(
      'Android file picker did not respond',
    );
    await vi.advanceTimersByTimeAsync(120000);
    await exportExpectation;

    const importExpectation = expect(openDesktopImportFile()).rejects.toThrow(
      'Android file picker did not respond',
    );
    await vi.advanceTimersByTimeAsync(120000);
    await importExpectation;
  });
});
