export const DEFAULT_CLIPBOARD_CLEAR_DELAY_MS = 30_000;

export async function writeClipboardText(text: string): Promise<boolean> {
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

    await clipboard.writeText('');
    return true;
  } catch {
    return false;
  }
}
