/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAndroidAutofillEnabled, isAndroidAutofillSupported, openAndroidAutofillSettings } from './androidAutofill';

afterEach(() => {
  delete window.AegisAndroidAutofill;
  vi.restoreAllMocks();
});

describe('android autofill bridge', () => {
  it('fails closed when the native bridge is not available', () => {
    expect(isAndroidAutofillSupported()).toBe(false);
    expect(isAndroidAutofillEnabled()).toBe(false);
    expect(openAndroidAutofillSettings()).toBe(false);
  });

  it('proxies support, enabled state, and settings opening through the native bridge', () => {
    const openSettings = vi.fn(() => true);
    window.AegisAndroidAutofill = {
      isSupported: () => true,
      isEnabled: () => true,
      openSettings,
    };

    expect(isAndroidAutofillSupported()).toBe(true);
    expect(isAndroidAutofillEnabled()).toBe(true);
    expect(openAndroidAutofillSettings()).toBe(true);
    expect(openSettings).toHaveBeenCalledTimes(1);
  });

  it('treats native bridge exceptions as unavailable', () => {
    window.AegisAndroidAutofill = {
      isSupported: () => {
        throw new Error('bridge unavailable');
      },
      isEnabled: () => {
        throw new Error('bridge unavailable');
      },
      openSettings: () => {
        throw new Error('bridge unavailable');
      },
    };

    expect(isAndroidAutofillSupported()).toBe(false);
    expect(isAndroidAutofillEnabled()).toBe(false);
    expect(openAndroidAutofillSettings()).toBe(false);
  });
});
