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

