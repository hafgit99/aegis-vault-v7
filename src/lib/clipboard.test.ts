// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearClipboardIfUnchanged, writeClipboardText } from './clipboard';

describe('clipboard helpers', () => {
  let clipboardText = '';
  let readText: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    clipboardText = '';
    readText = vi.fn().mockImplementation(() => Promise.resolve(clipboardText));
    writeText = vi.fn().mockImplementation((text: string) => {
      clipboardText = text;
      return Promise.resolve();
    });
    Object.assign(navigator, {
      clipboard: {
        readText,
        writeText,
      },
    });
  });

  it('writes text to the clipboard', async () => {
    await expect(writeClipboardText('secret')).resolves.toBe(true);

    expect(writeText).toHaveBeenCalledWith('secret');
    expect(clipboardText).toBe('secret');
  });

  it('returns false when clipboard writes are unavailable or rejected', async () => {
    Object.assign(navigator, { clipboard: {} });

    await expect(writeClipboardText('secret')).resolves.toBe(false);

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('denied')),
      },
    });

    await expect(writeClipboardText('secret')).resolves.toBe(false);
  });

  it('clears only when clipboard content is unchanged', async () => {
    clipboardText = 'secret';

    await expect(clearClipboardIfUnchanged('secret')).resolves.toBe(true);

    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('');
    expect(clipboardText).toBe('');
  });

  it('leaves newer clipboard content intact', async () => {
    clipboardText = 'new value';

    await expect(clearClipboardIfUnchanged('secret')).resolves.toBe(false);

    expect(readText).toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
    expect(clipboardText).toBe('new value');
  });

  it('does not clear when expected text or required clipboard methods are missing', async () => {
    await expect(clearClipboardIfUnchanged('')).resolves.toBe(false);
    expect(readText).not.toHaveBeenCalled();

    Object.assign(navigator, {
      clipboard: {
        readText,
      },
    });

    await expect(clearClipboardIfUnchanged('secret')).resolves.toBe(false);
  });

  it('returns false when reading or clearing the clipboard fails', async () => {
    readText.mockRejectedValueOnce(new Error('read denied'));

    await expect(clearClipboardIfUnchanged('secret')).resolves.toBe(false);

    readText.mockResolvedValueOnce('secret');
    writeText.mockRejectedValueOnce(new Error('write denied'));

    await expect(clearClipboardIfUnchanged('secret')).resolves.toBe(false);
  });
});
