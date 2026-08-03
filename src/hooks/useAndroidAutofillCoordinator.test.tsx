/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import { useAndroidAutofillCoordinator } from './useAndroidAutofillCoordinator';

const autofillState = vi.hoisted(() => ({
  pendingRequest: null as any,
  pendingSaveCandidate: null as any,
  requestListeners: [] as Array<(request: any) => void>,
  saveListeners: [] as Array<(candidate: any) => void>,
  fresh: true,
  completeResult: true,
  resolvedSaves: new Map<string, any>(),
}));

const androidAutofillMock = vi.hoisted(() => ({
  clearPendingAndroidAutofillRequest: vi.fn((requestId?: string) => {
    if (!requestId || autofillState.pendingRequest?.requestId === requestId) {
      autofillState.pendingRequest = null;
    }
  }),
  clearPendingAndroidAutofillSaveCandidate: vi.fn((requestId?: string) => {
    if (!requestId || autofillState.pendingSaveCandidate?.requestId === requestId) {
      autofillState.pendingSaveCandidate = null;
    }
  }),
  completePendingAndroidAutofillRequest: vi.fn((requestId: string) => {
    if (autofillState.pendingRequest?.requestId === requestId && autofillState.completeResult) {
      autofillState.pendingRequest = null;
      return true;
    }
    return false;
  }),
  getPendingAndroidAutofillRequest: vi.fn(() => autofillState.pendingRequest),
  getPendingAndroidAutofillSaveCandidate: vi.fn(() => autofillState.pendingSaveCandidate),
  isAndroidAutofillRequestFresh: vi.fn(() => autofillState.fresh),
  requiresEncryptedAutofillSaveResolution: vi.fn((candidate: any) =>
    Boolean(candidate && candidate.payloadUri && candidate.payloadToken && candidate.password === ''),
  ),
  resolveEncryptedAndroidAutofillSaveCandidate: vi.fn((requestId: string) => {
    if (autofillState.resolvedSaves.has(requestId)) {
      const resolved = autofillState.resolvedSaves.get(requestId);
      autofillState.resolvedSaves.delete(requestId);
      return resolved;
    }
    return null;
  }),
  subscribeAndroidAutofillRequests: vi.fn((listener: (request: any) => void) => {
    autofillState.requestListeners.push(listener);
    return () => {
      autofillState.requestListeners = autofillState.requestListeners.filter((candidate) => candidate !== listener);
    };
  }),
  subscribeAndroidAutofillSaveCandidates: vi.fn((listener: (candidate: any) => void) => {
    autofillState.saveListeners.push(listener);
    return () => {
      autofillState.saveListeners = autofillState.saveListeners.filter((candidate) => candidate !== listener);
    };
  }),
}));

const securityMock = vi.hoisted(() => ({
  logAndroidAutofillSecurityEvent: vi.fn(),
}));

vi.mock('../i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

vi.mock('../lib/androidAutofill', () => androidAutofillMock);
vi.mock('../lib/androidAutofillSecurity', () => securityMock);

const request = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'request-1',
  createdAt: Date.now(),
  appPackage: 'com.android.chrome',
  webDomain: 'example.com',
  usernameFieldCount: 1,
  passwordFieldCount: 1,
  fillableFieldCount: 2,
  ...overrides,
});

const saveCandidate = (overrides: Record<string, unknown> = {}) => ({
  requestId: 'save-1',
  createdAt: Date.now(),
  title: 'Example',
  username: 'alice',
  password: 'StrongPass123!',
  url: 'https://example.com/login',
  webDomain: 'example.com',
  appPackage: 'com.android.chrome',
  ...overrides,
});

const vaultItem = (overrides: Partial<VaultItem> = {}): VaultItem => ({
  id: 'item-1',
  title: 'Example Login',
  username: 'alice',
  password: 'StrongPass123!',
  url: 'https://example.com',
  category: 'login',
  notes: '',
  createdAt: '2026-07-04T00:00:00.000Z',
  updatedAt: '2026-07-04T00:00:00.000Z',
  ...overrides,
});

function renderCoordinator(unlocked = true) {
  const setActiveTab = vi.fn();
  const openNewItemForm = vi.fn();
  const showNotification = vi.fn();
  const hook = renderHook(() =>
    useAndroidAutofillCoordinator({
      unlocked,
      setActiveTab,
      openNewItemForm,
      showNotification,
    }),
  );

  return { ...hook, setActiveTab, openNewItemForm, showNotification };
}

describe('useAndroidAutofillCoordinator', () => {
  beforeEach(() => {
    autofillState.pendingRequest = null;
    autofillState.pendingSaveCandidate = null;
    autofillState.requestListeners = [];
    autofillState.saveListeners = [];
    autofillState.fresh = true;
    autofillState.completeResult = true;
    autofillState.resolvedSaves = new Map();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('surfaces a fresh pending autofill request after unlock', () => {
    autofillState.pendingRequest = request();

    const { result, setActiveTab, showNotification } = renderCoordinator(true);

    expect(result.current.pendingAutofillRequest).toMatchObject({ requestId: 'request-1' });
    expect(setActiveTab).toHaveBeenCalledWith('vault');
    expect(showNotification).toHaveBeenCalledWith({
      title: 'autofill.notification.title',
      message: 'autofill.notification.message',
      type: 'info',
    });
    expect(securityMock.logAndroidAutofillSecurityEvent).toHaveBeenCalledWith('requested', autofillState.pendingRequest);
  });

  it('rejects stale autofill requests before notifying the vault UI', () => {
    autofillState.pendingRequest = request({ requestId: 'stale-request' });
    autofillState.fresh = false;

    const { result, setActiveTab, showNotification } = renderCoordinator(true);

    expect(result.current.pendingAutofillRequest).toBeNull();
    expect(androidAutofillMock.clearPendingAndroidAutofillRequest).toHaveBeenCalledWith('stale-request');
    expect(securityMock.logAndroidAutofillSecurityEvent).toHaveBeenCalledWith('failed', expect.objectContaining({ requestId: 'stale-request' }));
    expect(setActiveTab).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('captures Android save candidates into a prefilled login form', () => {
    autofillState.pendingSaveCandidate = saveCandidate();

    const { openNewItemForm, setActiveTab, showNotification } = renderCoordinator(true);

    expect(androidAutofillMock.clearPendingAndroidAutofillSaveCandidate).toHaveBeenCalledWith('save-1');
    expect(setActiveTab).toHaveBeenCalledWith('vault');
    expect(openNewItemForm).toHaveBeenCalledWith({
      title: 'Example',
      username: 'alice',
      password: 'StrongPass123!',
      url: 'https://example.com/login',
      category: 'login',
    });
    expect(showNotification).toHaveBeenCalledWith({
      title: 'autofill.saveCaptured.title',
      message: 'autofill.saveCaptured.message',
      type: 'info',
    });
  });

  it('cancels the active autofill request with an audit event', () => {
    autofillState.pendingRequest = request({ requestId: 'cancel-me' });
    const { result, showNotification } = renderCoordinator(true);

    act(() => {
      result.current.cancelAutofillRequest();
    });

    expect(androidAutofillMock.clearPendingAndroidAutofillRequest).toHaveBeenCalledWith('cancel-me');
    expect(securityMock.logAndroidAutofillSecurityEvent).toHaveBeenCalledWith('cancelled', expect.objectContaining({ requestId: 'cancel-me' }));
    expect(result.current.pendingAutofillRequest).toBeNull();
    expect(showNotification).toHaveBeenLastCalledWith({
      title: 'autofill.cancelled.title',
      message: 'autofill.cancelled.message',
      type: 'info',
    });
  });

  it('approves a fresh autofill request and completes the native bridge', () => {
    autofillState.pendingRequest = request({ requestId: 'approve-me' });
    const { result, showNotification } = renderCoordinator(true);

    act(() => {
      result.current.approveAutofillRequest(vaultItem());
    });

    expect(androidAutofillMock.completePendingAndroidAutofillRequest).toHaveBeenCalledWith(
      'approve-me',
      'alice',
      'StrongPass123!',
      'Example Login',
    );
    expect(securityMock.logAndroidAutofillSecurityEvent).toHaveBeenCalledWith(
      'completed',
      expect.objectContaining({ requestId: 'approve-me' }),
      expect.objectContaining({ id: 'item-1' }),
    );
    expect(result.current.pendingAutofillRequest).toBeNull();
    expect(showNotification).toHaveBeenLastCalledWith({
      title: 'autofill.completed.title',
      message: 'autofill.completed.message',
      type: 'success',
    });
  });

  it('reports completion failures without clearing the active request', () => {
    autofillState.pendingRequest = request({ requestId: 'fail-me' });
    autofillState.completeResult = false;
    const { result, showNotification } = renderCoordinator(true);

    act(() => {
      result.current.approveAutofillRequest(vaultItem());
    });

    expect(securityMock.logAndroidAutofillSecurityEvent).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ requestId: 'fail-me' }),
      expect.objectContaining({ id: 'item-1' }),
    );
    expect(result.current.pendingAutofillRequest).toMatchObject({ requestId: 'fail-me' });
    expect(showNotification).toHaveBeenLastCalledWith({
      title: 'autofill.failed.title',
      message: 'autofill.failed.message',
      type: 'danger',
    });
  });

  it('accepts new autofill requests delivered through the subscription', () => {
    const { result, setActiveTab } = renderCoordinator(true);
    const liveRequest = request({ requestId: 'live-request' });

    act(() => {
      autofillState.pendingRequest = liveRequest;
      autofillState.requestListeners[0](liveRequest);
    });

    expect(result.current.pendingAutofillRequest).toMatchObject({ requestId: 'live-request' });
    expect(setActiveTab).toHaveBeenCalledWith('vault');
    expect(securityMock.logAndroidAutofillSecurityEvent).toHaveBeenCalledWith('requested', liveRequest);
  });

  it('waits until unlock before announcing a pending request', () => {
    autofillState.pendingRequest = request({ requestId: 'locked-request' });
    const controls = {
      setActiveTab: vi.fn(),
      openNewItemForm: vi.fn(),
      showNotification: vi.fn(),
    };
    const { rerender, result } = renderHook(
      ({ unlocked }) => useAndroidAutofillCoordinator({ unlocked, ...controls }),
      { initialProps: { unlocked: false } },
    );

    expect(result.current.pendingAutofillRequest).toMatchObject({ requestId: 'locked-request' });
    expect(controls.setActiveTab).not.toHaveBeenCalled();

    rerender({ unlocked: true });

    expect(controls.setActiveTab).toHaveBeenCalledWith('vault');
    expect(controls.showNotification).toHaveBeenCalledWith({
      title: 'autofill.notification.title',
      message: 'autofill.notification.message',
      type: 'info',
    });
  });

  it('rejects requests that become stale before approval', () => {
    autofillState.pendingRequest = request({ requestId: 'expires-before-approval' });
    const { result, showNotification } = renderCoordinator(true);
    autofillState.fresh = false;

    act(() => {
      result.current.approveAutofillRequest(vaultItem());
    });

    expect(androidAutofillMock.clearPendingAndroidAutofillRequest).toHaveBeenCalledWith('expires-before-approval');
    expect(securityMock.logAndroidAutofillSecurityEvent).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ requestId: 'expires-before-approval' }),
    );
    expect(showNotification).toHaveBeenLastCalledWith({
      title: 'autofill.failed.title',
      message: 'autofill.failed.message',
      type: 'danger',
    });
  });

  it('uses domain and package fallbacks for sparse save candidates', () => {
    const sparseCandidate = saveCandidate({
      requestId: 'save-sparse',
      title: '',
      username: undefined,
      password: undefined,
      url: undefined,
      webDomain: 'fallback.example',
      appPackage: 'com.example.app',
    });
    const { openNewItemForm } = renderCoordinator(true);

    act(() => {
      autofillState.pendingSaveCandidate = sparseCandidate;
      autofillState.saveListeners[0](sparseCandidate);
    });

    expect(openNewItemForm).toHaveBeenCalledWith({
      title: 'fallback.example',
      username: '',
      password: '',
      url: 'fallback.example',
      category: 'login',
    });
  });

  it('resolves encrypted save payloads via the native bridge before opening the form', async () => {
    const encryptedCandidate = {
      ...saveCandidate({ requestId: 'encrypted-save' }),
      password: '',
      payloadUri: 'content://com.hafgit99.aegisvault7.fileprovider/aegis-autofill-tmp/abcd.aest',
      payloadToken: 'opaque-token',
    };
    autofillState.pendingSaveCandidate = encryptedCandidate;
    autofillState.resolvedSaves.set('encrypted-save', {
      ...encryptedCandidate,
      password: 'Decrypted!Pass1',
    });

    const { openNewItemForm, setActiveTab } = renderCoordinator(true);

    await act(async () => {
      autofillState.saveListeners[0](encryptedCandidate);
      await Promise.resolve();
    });

    expect(androidAutofillMock.resolveEncryptedAndroidAutofillSaveCandidate).toHaveBeenCalledWith('encrypted-save');
    expect(androidAutofillMock.clearPendingAndroidAutofillSaveCandidate).toHaveBeenCalledWith('encrypted-save');
    expect(setActiveTab).toHaveBeenCalledWith('vault');
    expect(openNewItemForm).toHaveBeenCalledWith({
      title: 'Example',
      username: 'alice',
      password: 'Decrypted!Pass1',
      url: 'https://example.com/login',
      category: 'login',
    });
  });

  it('skips the form when the encrypted payload cannot be resolved', async () => {
    const encryptedCandidate = {
      ...saveCandidate({ requestId: 'encrypted-missing' }),
      password: '',
      payloadUri: 'content://com.hafgit99.aegisvault7.fileprovider/aegis-autofill-tmp/missing.aest',
      payloadToken: 'opaque-token',
    };
    const { openNewItemForm, setActiveTab, showNotification } = renderCoordinator(true);

    await act(async () => {
      autofillState.saveListeners[0](encryptedCandidate);
      await Promise.resolve();
    });

    expect(androidAutofillMock.resolveEncryptedAndroidAutofillSaveCandidate).toHaveBeenCalledWith('encrypted-missing');
    expect(openNewItemForm).not.toHaveBeenCalled();
    expect(setActiveTab).not.toHaveBeenCalledWith('vault');
    expect(androidAutofillMock.clearPendingAndroidAutofillSaveCandidate).toHaveBeenCalledWith('encrypted-missing');
    expect(showNotification).toHaveBeenCalledWith({
      title: 'autofill.saveCaptured.title',
      message: 'autofill.saveCaptured.message',
      type: 'info',
    });
  });
});

