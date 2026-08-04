/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSyncCoordinator } from './useSyncCoordinator';
import * as syncModule from '../lib/sync';

vi.mock('../lib/sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/sync')>();
  return {
    ...actual,
    hasSyncConfig: vi.fn(() => false),
    loadSyncConfig: vi.fn(async () => ({ type: 'disabled' })),
    performSync: vi.fn(async () => ({ status: 'success', mergedItems: [] })),
    createSyncProvider: vi.fn(() => ({
      uploadVault: vi.fn(),
      downloadVault: vi.fn(),
      getRemoteMetadata: vi.fn(),
      testConnection: vi.fn(),
      dispose: vi.fn(),
    })),
  };
});

describe('useSyncCoordinator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('defaults to idle status when sync is not configured', () => {
    const { result } = renderHook(() =>
      useSyncCoordinator({ items: [], masterPassword: 'password123' }),
    );

    expect(result.current.syncStatus).toBe('idle');
    expect(result.current.isConfigured).toBe(false);
  });

  it('triggers sync when masterPassword is provided and sync is configured', async () => {
    vi.mocked(syncModule.hasSyncConfig).mockReturnValue(true);
    vi.mocked(syncModule.loadSyncConfig).mockResolvedValue({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'u',
      password: 'p',
    });

    const { result } = renderHook(() =>
      useSyncCoordinator({ items: [], masterPassword: 'password123' }),
    );

    await waitFor(() => {
      expect(syncModule.performSync).toHaveBeenCalled();
    });

    expect(result.current.syncStatus).toBe('success');
  });

  it('clears sync error when clearSyncError is called', async () => {
    vi.mocked(syncModule.hasSyncConfig).mockReturnValue(true);
    vi.mocked(syncModule.loadSyncConfig).mockResolvedValue({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'u',
      password: 'p',
    });
    vi.mocked(syncModule.performSync).mockResolvedValue({
      status: 'error',
      error: new syncModule.SyncError(syncModule.syncErrorCodes.connectionFailed, 'Network down'),
      mergedItems: [],
    });

    const { result } = renderHook(() =>
      useSyncCoordinator({ items: [], masterPassword: 'password123' }),
    );

    await waitFor(() => {
      expect(result.current.syncStatus).toBe('error');
    });

    act(() => {
      result.current.clearSyncError();
    });

    expect(result.current.syncStatus).toBe('idle');
    expect(result.current.syncError).toBeNull();
  });
});
