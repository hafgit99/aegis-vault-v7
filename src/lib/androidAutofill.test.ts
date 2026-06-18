/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPendingAndroidAutofillRequest,
  completePendingAndroidAutofillRequest,
  getPendingAndroidAutofillRequest,
  isAndroidAutofillEnabled,
  isAndroidAutofillSupported,
  openAndroidAutofillSettings,
  subscribeAndroidAutofillRequests,
} from './androidAutofill';

afterEach(() => {
  delete window.AegisAndroidAutofill;
  vi.restoreAllMocks();
});

describe('android autofill bridge', () => {
  it('fails closed when the native bridge is not available', () => {
    expect(isAndroidAutofillSupported()).toBe(false);
    expect(isAndroidAutofillEnabled()).toBe(false);
    expect(openAndroidAutofillSettings()).toBe(false);
    expect(completePendingAndroidAutofillRequest('request-1', 'user', 'pass', 'Example')).toBe(false);
  });

  it('proxies support, enabled state, and settings opening through the native bridge', () => {
    const openSettings = vi.fn(() => true);
    window.AegisAndroidAutofill = {
      isSupported: () => true,
      isEnabled: () => true,
      openSettings,
      getPendingRequest: () => null,
      clearPendingRequest: () => true,
      completePendingRequest: () => true,
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
      getPendingRequest: () => {
        throw new Error('bridge unavailable');
      },
      clearPendingRequest: () => {
        throw new Error('bridge unavailable');
      },
      completePendingRequest: () => {
        throw new Error('bridge unavailable');
      },
    };

    expect(isAndroidAutofillSupported()).toBe(false);
    expect(isAndroidAutofillEnabled()).toBe(false);
    expect(openAndroidAutofillSettings()).toBe(false);
    expect(getPendingAndroidAutofillRequest()).toBeNull();
    expect(clearPendingAndroidAutofillRequest('request-1')).toBe(false);
    expect(completePendingAndroidAutofillRequest('request-1', 'user', 'pass', 'Example')).toBe(false);
  });

  it('reads, clears, and completes a pending Android Autofill launch request', () => {
    const clearPendingRequest = vi.fn(() => true);
    const completePendingRequest = vi.fn(() => true);
    window.AegisAndroidAutofill = {
      isSupported: () => true,
      isEnabled: () => true,
      openSettings: () => true,
      getPendingRequest: () => JSON.stringify({
        requestId: 'android-autofill-1',
        createdAt: 12345,
        source: 'android-autofill',
      }),
      clearPendingRequest,
      completePendingRequest,
    };

    expect(getPendingAndroidAutofillRequest()).toEqual({
      requestId: 'android-autofill-1',
      createdAt: 12345,
      source: 'android-autofill',
    });
    expect(clearPendingAndroidAutofillRequest('android-autofill-1')).toBe(true);
    expect(clearPendingRequest).toHaveBeenCalledWith('android-autofill-1');
    expect(completePendingAndroidAutofillRequest('android-autofill-1', 'ada@example.com', 'secret', 'Aegis Mail')).toBe(true);
    expect(completePendingRequest).toHaveBeenCalledWith('android-autofill-1', 'ada@example.com', 'secret', 'Aegis Mail');
  });

  it('ignores malformed pending Android Autofill request payloads', () => {
    window.AegisAndroidAutofill = {
      isSupported: () => true,
      isEnabled: () => true,
      openSettings: () => true,
      getPendingRequest: () => '{"requestId":42}',
      clearPendingRequest: () => true,
      completePendingRequest: () => true,
    };

    expect(getPendingAndroidAutofillRequest()).toBeNull();
  });

  it('notifies subscribers when native code reports an Autofill request', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAndroidAutofillRequests(listener);

    window.__aegisAndroidAutofill?.onRequest({
      requestId: 'android-autofill-2',
      createdAt: 67890,
      source: 'android-autofill',
    });
    window.__aegisAndroidAutofill?.onRequest(null);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      requestId: 'android-autofill-2',
      createdAt: 67890,
      source: 'android-autofill',
    });

    unsubscribe();
    window.__aegisAndroidAutofill?.onRequest({
      requestId: 'android-autofill-3',
      createdAt: 999,
      source: 'android-autofill',
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
