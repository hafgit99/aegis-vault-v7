/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { getAttachmentBlob } from '../lib/attachments';
import { saveDesktopBinaryFile } from '../lib/desktopFiles';
import { useAttachmentDownload } from './useAttachmentDownload';

vi.mock('../lib/attachments', () => ({
  getAttachmentBlob: vi.fn(),
}));

vi.mock('../lib/desktopFiles', () => ({
  saveDesktopBinaryFile: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(getAttachmentBlob).mockReset();
  vi.mocked(saveDesktopBinaryFile).mockReset();
  localStorage.clear();
  delete window.__TAURI_INTERNALS__;
});

function renderAttachmentDownload(onNotify: (notification: any) => void, language?: 'en' | 'zh') {
  if (language) {
    localStorage.setItem(languageStorageKey, language);
  }

  return renderHook(() => useAttachmentDownload({ onNotify }), {
    wrapper: ({ children }) => <LanguageProvider>{children}</LanguageProvider>,
  });
}

describe('useAttachmentDownload', () => {
  it('downloads an existing attachment through a temporary anchor', async () => {
    const blob = new Blob(['secret'], { type: 'text/plain' });
    vi.mocked(getAttachmentBlob).mockResolvedValue({ blob, name: 'secret.txt' });
    const createObjectURL = vi.fn(() => 'blob:attachment');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('attachment-1', 'download.txt');
    });

    expect(getAttachmentBlob).toHaveBeenCalledWith('attachment-1');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:attachment');
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('saves attachments through the native desktop file dialog inside Tauri', async () => {
    window.__TAURI_INTERNALS__ = {};
    const blob = new Blob(['secret'], { type: 'text/plain' });
    vi.mocked(getAttachmentBlob).mockResolvedValue({ blob, name: 'secret.txt' });
    vi.mocked(saveDesktopBinaryFile).mockResolvedValue(true);
    const createObjectURL = vi.fn(() => 'blob:attachment');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('attachment-1', 'download.txt');
    });

    const savedBytes = vi.mocked(saveDesktopBinaryFile).mock.calls[0]![1];
    expect(saveDesktopBinaryFile).toHaveBeenCalledWith('secret.txt', expect.any(Uint8Array));
    expect(Array.from(savedBytes)).toEqual(Array.from(new TextEncoder().encode('secret')));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('falls back to the browser download path when native desktop saving is unavailable', async () => {
    window.__TAURI_INTERNALS__ = {};
    const blob = new Blob(['secret'], { type: 'text/plain' });
    vi.mocked(getAttachmentBlob).mockResolvedValue({ blob, name: 'secret.txt' });
    vi.mocked(saveDesktopBinaryFile).mockRejectedValue(new Error('unsupported'));
    const createObjectURL = vi.fn(() => 'blob:attachment');
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('attachment-1', 'download.txt');
    });

    expect(saveDesktopBinaryFile).toHaveBeenCalledWith('secret.txt', expect.any(Uint8Array));
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:attachment');
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('does not fall back to browser download when the native save dialog is cancelled', async () => {
    window.__TAURI_INTERNALS__ = {};
    const blob = new Blob(['secret'], { type: 'text/plain' });
    vi.mocked(getAttachmentBlob).mockResolvedValue({ blob, name: 'secret.txt' });
    vi.mocked(saveDesktopBinaryFile).mockResolvedValue(false);
    const createObjectURL = vi.fn(() => 'blob:attachment');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('attachment-1', 'download.txt');
    });

    expect(saveDesktopBinaryFile).toHaveBeenCalledWith('secret.txt', expect.any(Uint8Array));
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('uses FileReader fallback when Blob.arrayBuffer is unavailable in desktop runtime', async () => {
    window.__TAURI_INTERNALS__ = {};
    const blob = new Blob(['legacy-reader'], { type: 'text/plain' });
    Object.defineProperty(blob, 'arrayBuffer', {
      configurable: true,
      value: undefined,
    });
    vi.mocked(getAttachmentBlob).mockResolvedValue({ blob, name: 'legacy.txt' });
    vi.mocked(saveDesktopBinaryFile).mockResolvedValue(true);
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('attachment-legacy', 'download.txt');
    });

    const savedBytes = vi.mocked(saveDesktopBinaryFile).mock.calls[0]![1];
    expect(Array.from(savedBytes)).toEqual(Array.from(new TextEncoder().encode('legacy-reader')));
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('uses the requested fallback filename when stored attachment metadata has no name', async () => {
    const blob = new Blob(['secret'], { type: 'text/plain' });
    vi.mocked(getAttachmentBlob).mockResolvedValue({ blob, name: '' });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:attachment'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    let clickedDownload = '';
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function clickMock(this: HTMLAnchorElement) {
      clickedDownload = this.download;
    });
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('attachment-1', 'fallback.txt');
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(clickedDownload).toBe('fallback.txt');
  });

  it('notifies when an attachment cannot be found', async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValue(null);
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('missing', 'missing.txt');
    });

    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dosya Bulunamadı',
        type: 'warning',
      }),
    );
  });

  it('notifies when attachment retrieval throws', async () => {
    vi.mocked(getAttachmentBlob).mockRejectedValue(new Error('nope'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onNotify = vi.fn();
    const { result } = renderAttachmentDownload(onNotify);

    await act(async () => {
      await result.current.downloadAttachment('broken', 'broken.txt');
    });

    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Dosya Açılamadı',
        type: 'danger',
      }),
    );
  });

  it('notifies in the selected language when attachment download fails', async () => {
    vi.mocked(getAttachmentBlob).mockResolvedValueOnce(null);
    const onNotify = vi.fn();
    const { result, rerender } = renderAttachmentDownload(onNotify, 'en');

    await act(async () => {
      await result.current.downloadAttachment('missing', 'missing.txt');
    });

    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'File Not Found',
        message: 'The selected file was not found in your local vault or has been deleted.',
        type: 'warning',
      }),
    );

    vi.mocked(getAttachmentBlob).mockRejectedValueOnce(new Error('nope'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    onNotify.mockClear();
    rerender();

    await act(async () => {
      await result.current.downloadAttachment('broken', 'broken.txt');
    });

    expect(onNotify).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'File Could Not Be Opened',
        message: 'An error occurred while decrypting the file.',
        type: 'danger',
      }),
    );
  });
});
