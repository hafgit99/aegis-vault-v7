/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('extension secure password generator', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: { addListener: vi.fn() },
        sendMessage: vi.fn((_message: unknown, callback?: (response: unknown) => void) => {
          callback?.({});
        }),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses WebCrypto-backed unbiased selection and never Math.random', async () => {
    const mathRandomSpy = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random must not be used by extension password generation');
    });

    const { generateSecurePassword } = await import('./content');
    const password = generateSecurePassword(32);

    expect(password).toHaveLength(32);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
    expect([...password].some((char) => '!@#$%^&*()-_=+[]{}|;:,.<>?'.includes(char))).toBe(true);
    expect(mathRandomSpy).not.toHaveBeenCalled();
  });

  it('enforces a minimum generated length that preserves all required character groups', async () => {
    const { generateSecurePassword } = await import('./content');

    const password = generateSecurePassword(1);

    expect(password).toHaveLength(4);
    expect(password).toMatch(/[a-z]/);
    expect(password).toMatch(/[A-Z]/);
    expect(password).toMatch(/[0-9]/);
    expect([...password].some((char) => '!@#$%^&*()-_=+[]{}|;:,.<>?'.includes(char))).toBe(true);
  });
});

describe('extension popup secure clipboard copy', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="lockedScreen"></div>
      <div id="credentialList"></div>
      <div id="searchWrapper"></div>
      <input id="searchInput" />
      <div id="phishingBanner"></div>
      <span id="phishingText"></span>
      <select id="langSelect"><option value="en">en</option></select>
      <button id="themeToggle"></button>
      <div id="toast"></div>
      <button id="focusAppBtn"></button>
      <input type="checkbox" id="autoSubmitToggle" />
      <label id="autoSubmitLabel"></label>
      <h1 id="lockedTitle"></h1>
      <p id="lockedDesc"></p>
    `;
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: vi.fn((_keys, callback) => callback?.({})),
          set: vi.fn(),
        },
      },
      runtime: {
        sendMessage: vi.fn(),
      },
      tabs: {
        query: vi.fn((_query, callback) => callback?.([])),
      },
    });
    vi.stubGlobal('navigator', {
      language: 'en',
      clipboard: {
        writeText: vi.fn(async () => undefined),
        readText: vi.fn(async () => 'secret-copied-pass'),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('automatically clears sensitive copied passwords after 30 seconds', async () => {
    const { copyToClipboardSecurely } = await import('./popup');

    copyToClipboardSecurely('secret-copied-pass', true);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-copied-pass');

    // Fast-forward 30 seconds
    await vi.advanceTimersByTimeAsync(30000);

    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('');
  });
});

