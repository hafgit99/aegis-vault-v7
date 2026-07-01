/**
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS,
  androidAutofillTargetLabel,
  clearPendingAndroidAutofillRequest,
  clearPendingAndroidAutofillSaveCandidate,
  completePendingAndroidAutofillRequest,
  getPendingAndroidAutofillRequest,
  getPendingAndroidAutofillSaveCandidate,
  isAndroidAutofillRequestFresh,
  isAndroidAutofillEnabled,
  isAndroidAutofillSupported,
  openAndroidAutofillSettings,
  subscribeAndroidAutofillRequests,
  subscribeAndroidAutofillSaveCandidates,
} from './androidAutofill';

afterEach(() => {
  delete window.AegisAndroidAutofill;
  delete window.__aegisAndroidAutofill;
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
        appPackage: 'com.example.app',
        webDomain: 'login.example.com',
      }),
      clearPendingRequest,
      completePendingRequest,
    };

    expect(getPendingAndroidAutofillRequest()).toEqual({
      requestId: 'android-autofill-1',
      createdAt: 12345,
      source: 'android-autofill',
      appPackage: 'com.example.app',
      webDomain: 'login.example.com',
    });
    expect(androidAutofillTargetLabel(getPendingAndroidAutofillRequest())).toBe('login.example.com');
    expect(clearPendingAndroidAutofillRequest('android-autofill-1')).toBe(true);
    expect(clearPendingRequest).toHaveBeenCalledWith('android-autofill-1');
    expect(completePendingAndroidAutofillRequest('android-autofill-1', 'ada@example.com', 'secret', 'Aegis Mail')).toBe(true);
    expect(completePendingRequest).toHaveBeenCalledWith('android-autofill-1', 'ada@example.com', 'secret', 'Aegis Mail');
  });

  it('reads and clears a pending Android Autofill save candidate', () => {
    const clearPendingSaveCandidate = vi.fn(() => true);
    window.AegisAndroidAutofill = {
      isSupported: () => true,
      isEnabled: () => true,
      openSettings: () => true,
      getPendingRequest: () => null,
      clearPendingRequest: () => true,
      completePendingRequest: () => true,
      getPendingSaveCandidate: () => JSON.stringify({
        requestId: 'android-autofill-save-1',
        createdAt: 12345,
        source: 'android-autofill-save',
        title: 'login.example.com',
        username: 'ada@example.com',
        password: 'secret',
        url: 'https://login.example.com',
        appPackage: 'com.android.chrome',
        webDomain: 'login.example.com',
      }),
      clearPendingSaveCandidate,
    };

    expect(getPendingAndroidAutofillSaveCandidate()).toEqual({
      requestId: 'android-autofill-save-1',
      createdAt: 12345,
      source: 'android-autofill-save',
      title: 'login.example.com',
      username: 'ada@example.com',
      password: 'secret',
      url: 'https://login.example.com',
      appPackage: 'com.android.chrome',
      webDomain: 'login.example.com',
    });
    expect(clearPendingAndroidAutofillSaveCandidate('android-autofill-save-1')).toBe(true);
    expect(clearPendingSaveCandidate).toHaveBeenCalledWith('android-autofill-save-1');
  });

  it('formats the best available Autofill target label', () => {
    expect(androidAutofillTargetLabel(null)).toBeNull();
    expect(androidAutofillTargetLabel({
      requestId: 'request-1',
      createdAt: 1,
      source: 'android-autofill',
      appPackage: 'com.example.app',
    })).toBe('com.example.app');
    expect(androidAutofillTargetLabel({
      requestId: 'request-2',
      createdAt: 2,
      source: 'android-autofill',
      appPackage: 'com.example.app',
      webDomain: 'login.example.com',
    })).toBe('login.example.com');
  });

  it('classifies stale Android Autofill requests by age', () => {
    const now = 10_000_000;
    const freshRequest = {
      requestId: 'fresh',
      createdAt: now - ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS + 1,
      source: 'android-autofill' as const,
    };

    expect(isAndroidAutofillRequestFresh(freshRequest, now)).toBe(true);
    expect(isAndroidAutofillRequestFresh({
      ...freshRequest,
      createdAt: now - ANDROID_AUTOFILL_REQUEST_MAX_AGE_MS - 1,
    }, now)).toBe(false);
    expect(isAndroidAutofillRequestFresh({
      ...freshRequest,
      createdAt: now + 1,
    }, now)).toBe(false);
    expect(isAndroidAutofillRequestFresh(null, now)).toBe(false);
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

  it('notifies subscribers when native code reports an Autofill save candidate', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAndroidAutofillSaveCandidates(listener);

    window.__aegisAndroidAutofill?.onSave({
      requestId: 'android-autofill-save-2',
      createdAt: 67890,
      source: 'android-autofill-save',
      title: 'Example',
      username: 'ada@example.com',
      password: 'secret',
    });
    window.__aegisAndroidAutofill?.onSave(null);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      requestId: 'android-autofill-save-2',
      createdAt: 67890,
      source: 'android-autofill-save',
      title: 'Example',
      username: 'ada@example.com',
      password: 'secret',
    });

    unsubscribe();
    window.__aegisAndroidAutofill?.onSave({
      requestId: 'android-autofill-save-3',
      createdAt: 999,
      source: 'android-autofill-save',
      title: 'Example',
      username: '',
      password: 'secret',
    });
    expect(listener).toHaveBeenCalledTimes(1);
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
