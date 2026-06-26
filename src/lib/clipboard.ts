import { invoke } from '@tauri-apps/api/core';
import { isDesktopRuntime } from './desktopStorage';

export const DEFAULT_CLIPBOARD_CLEAR_DELAY_MS = 30_000;

export async function writeClipboardText(text: string): Promise<boolean> {
  if (isDesktopRuntime()) {
    try {
      const success = await invoke<boolean>('write_clipboard_text_protected', { text });
      if (success) return true;
    } catch (e) {
      console.warn('Native protected clipboard write failed, falling back to navigator.clipboard:', e);
    }
  }

  const clipboard = navigator.clipboard;
  if (!clipboard?.writeText) return false;

  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function clearClipboardIfUnchanged(expectedText: string): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (!expectedText || !clipboard?.readText || !clipboard?.writeText) return false;

  try {
    const currentText = await clipboard.readText();
    if (currentText !== expectedText) return false;

    return await writeClipboardText('');
  } catch {
    return false;
  }
}
