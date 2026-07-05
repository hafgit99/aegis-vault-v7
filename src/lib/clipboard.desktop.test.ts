/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtimeMock = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
}));

const tauriMock = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('./desktopStorage', () => runtimeMock);
vi.mock('@tauri-apps/api/core', () => tauriMock);

describe('clipboard helpers - desktop protected clipboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
        readText: vi.fn().mockResolvedValue('secret'),
      },
    });
  });

  it('uses the native protected clipboard path when desktop runtime succeeds', async () => {
    tauriMock.invoke.mockResolvedValueOnce(true);
    const { writeClipboardText } = await import('./clipboard');

    await expect(writeClipboardText('secret')).resolves.toBe(true);

    expect(tauriMock.invoke).toHaveBeenCalledWith('write_clipboard_text_protected', { text: 'secret' });
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('falls back to navigator clipboard when native protected write fails', async () => {
    tauriMock.invoke.mockRejectedValueOnce(new Error('native denied'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { writeClipboardText } = await import('./clipboard');

    await expect(writeClipboardText('secret')).resolves.toBe(true);

    expect(warn).toHaveBeenCalled();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret');
    warn.mockRestore();
  });
});
