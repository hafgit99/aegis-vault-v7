// @vitest-environment jsdom

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PasswordGenerator from './PasswordGenerator';

describe('PasswordGenerator', () => {
  let clipboardText = '';
  let readText: ReturnType<typeof vi.fn>;
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
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

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('clears generated passwords from the clipboard when unchanged', async () => {
    const { container } = render(<PasswordGenerator />);
    const copyButton = container.querySelector<HTMLButtonElement>('#copy-password-btn');

    expect(copyButton).not.toBeNull();
    fireEvent.click(copyButton!);

    const copiedPassword = clipboardText;
    expect(writeText).toHaveBeenCalledWith(copiedPassword);
    expect(copiedPassword.length).toBeGreaterThan(0);

    await act(async () => {
      vi.advanceTimersByTime(30000);
      await Promise.resolve();
    });

    expect(readText).toHaveBeenCalled();
    expect(writeText).toHaveBeenLastCalledWith('');
    expect(clipboardText).toBe('');
  });
});
