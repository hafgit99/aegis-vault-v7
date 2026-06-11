/**
 * @vitest-environment jsdom
 */

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LanguageProvider } from '../i18n/LanguageContext';
import { languageStorageKey } from '../i18n/translations';
import { getAttachmentBlob } from '../lib/attachments';
import { useAttachmentDownload } from './useAttachmentDownload';

vi.mock('../lib/attachments', () => ({
  getAttachmentBlob: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
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
