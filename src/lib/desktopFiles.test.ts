/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDesktopFileDialogSupported,
  isNativeFileDialogSupported,
  saveDesktopExportFile,
  saveDesktopBinaryFile,
  openDesktopImportFile,
  MAX_ANDROID_PAYLOAD_BYTES,
} from './desktopFiles';
import { invoke } from '@tauri-apps/api/core';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('desktopFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as any).__TAURI_INTERNALS__;
    delete (window as any).AegisAndroidFiles;
    delete (window as any).__aegisAndroidFiles;
  });

  it('returns false for desktop file dialog when not in Tauri environment', () => {
    expect(isDesktopFileDialogSupported()).toBe(false);
    expect(isNativeFileDialogSupported()).toBe(false);
  });

  it('detects desktop file dialog support in desktop Tauri environment', () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isDesktopFileDialogSupported()).toBe(true);
    expect(isNativeFileDialogSupported()).toBe(true);
  });

  it('saves desktop export file via Tauri invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValueOnce(true);

    const saved = await saveDesktopExportFile('backup.json', '{"test":1}');
    expect(saved).toBe(true);
    expect(invoke).toHaveBeenCalledWith('save_export_file', {
      defaultFilename: 'backup.json',
      contents: '{"test":1}',
    });
  });

  it('saves desktop binary file via Tauri invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValueOnce(true);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const saved = await saveDesktopBinaryFile('backup.aegis', bytes);
    expect(saved).toBe(true);
    expect(invoke).toHaveBeenCalledWith('save_binary_file', {
      defaultFilename: 'backup.aegis',
      contentsBase64: expect.any(String),
    });
  });

  it('opens desktop import file via Tauri invoke', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    vi.mocked(invoke).mockResolvedValueOnce({ name: 'backup.json', contents: '{"items":[]}' });

    const file = await openDesktopImportFile();
    expect(file).toEqual({ name: 'backup.json', contents: '{"items":[]}' });
    expect(invoke).toHaveBeenCalledWith('open_import_file');
  });

  it('returns null/false when saving or opening on unsupported non-Tauri runtime', async () => {
    expect(await saveDesktopExportFile('test.json', '{}')).toBe(false);
    expect(await saveDesktopBinaryFile('test.aegis', new Uint8Array())).toBe(false);
    expect(await openDesktopImportFile()).toBeNull();
  });

  it('handles Android file bridge save and open requests', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    const saveMock = vi.fn((requestId) => {
      setTimeout(() => {
        window.__aegisAndroidFiles?.resolveSave(requestId, true);
      }, 10);
    });
    const saveBase64Mock = vi.fn((requestId) => {
      setTimeout(() => {
        window.__aegisAndroidFiles?.resolveSave(requestId, true);
      }, 10);
    });
    const openMock = vi.fn((requestId) => {
      setTimeout(() => {
        window.__aegisAndroidFiles?.resolveOpen(requestId, { name: 'android.json', contents: '{"a":1}' });
      }, 10);
    });

    (window as any).AegisAndroidFiles = {
      saveTextFile: saveMock,
      saveBase64File: saveBase64Mock,
      openTextFile: openMock,
    };

    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    expect(isNativeFileDialogSupported()).toBe(true);

    const savedText = await saveDesktopExportFile('backup.json', '{"test":1}');
    expect(savedText).toBe(true);
    expect(saveMock).toHaveBeenCalled();

    const savedBinary = await saveDesktopBinaryFile('backup.aegis', new Uint8Array([10, 20]));
    expect(savedBinary).toBe(true);
    expect(saveBase64Mock).toHaveBeenCalled();

    const opened = await openDesktopImportFile();
    expect(opened).toEqual({ name: 'android.json', contents: '{"a":1}' });
    expect(openMock).toHaveBeenCalled();
  });

  it('rejects oversized payloads on Android file bridge', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).AegisAndroidFiles = {
      saveTextFile: vi.fn(),
      saveBase64File: vi.fn(),
      openTextFile: vi.fn(),
    };
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    const largeString = 'a'.repeat(MAX_ANDROID_PAYLOAD_BYTES + 10);
    await expect(saveDesktopExportFile('huge.json', largeString)).rejects.toThrow(/exceeds/i);

    // We test binary save
    const largeBytes = new Uint8Array(MAX_ANDROID_PAYLOAD_BYTES + 100);
    await expect(saveDesktopBinaryFile('huge.aegis', largeBytes)).rejects.toThrow(/exceeds/i);
  });

  it('handles bridge errors properly', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).AegisAndroidFiles = {
      saveTextFile: vi.fn((requestId) => {
        setTimeout(() => {
          window.__aegisAndroidFiles?.resolveSave(requestId, false, 'Disk full');
        }, 10);
      }),
      saveBase64File: vi.fn(),
      openTextFile: vi.fn((requestId) => {
        setTimeout(() => {
          window.__aegisAndroidFiles?.resolveOpen(requestId, null, 'Cancelled');
        }, 10);
      }),
    };
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    await expect(saveDesktopExportFile('test.json', '{}')).rejects.toThrow('Disk full');
    await expect(openDesktopImportFile()).rejects.toThrow('Cancelled');
  });

  it('handles bridge synchronous exceptions', async () => {
    (window as any).__TAURI_INTERNALS__ = {};
    (window as any).AegisAndroidFiles = {
      saveTextFile: vi.fn(),
      saveBase64File: vi.fn(() => {
        throw new Error('Bridge broken');
      }),
      openTextFile: vi.fn(() => {
        throw new Error('Open bridge broken');
      }),
    };
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14)');

    await expect(saveDesktopBinaryFile('test.bin', new Uint8Array([1]))).rejects.toThrow('Bridge broken');
    await expect(openDesktopImportFile()).rejects.toThrow('Open bridge broken');
  });
});
