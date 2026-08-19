/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsSync } from './useSettingsSync';
import * as syncModule from '../lib/sync';
import * as storageModule from '../lib/storage';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';

vi.mock('../lib/sync', async () => {
  const actual = await vi.importActual<typeof import('../lib/sync')>('../lib/sync');
  return {
    ...actual,
    getLastSyncTime: vi.fn(() => '2026-01-01T00:00:00.000Z'),
    hasSyncConfig: vi.fn(() => false),
    validateWebDavConfig: vi.fn(),
    validateS3Config: vi.fn(),
    saveSyncConfig: vi.fn(),
    clearSyncConfig: vi.fn(),
    loadSyncConfig: vi.fn(),
    createSyncProvider: vi.fn(),
    performSync: vi.fn(),
    saveLastSyncTime: vi.fn(),
    WebDavSyncProvider: class {
      testConnection() {
        return Promise.resolve();
      }
    },
    S3SyncProvider: class {
      testConnection() {
        return Promise.resolve();
      }
    },
  };
});

vi.mock('../lib/storage', () => ({
  getVaultItems: vi.fn().mockResolvedValue([]),
  saveVaultItems: vi.fn().mockResolvedValue([]),
}));

vi.mock('../lib/vaultSession', async () => {
  const actual = await vi.importActual<typeof import('../lib/vaultSession')>('../lib/vaultSession');
  return {
    ...actual,
    withActiveBackupPassword: vi.fn((cb) => cb('mock-password-123')),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useSettingsSync', () => {
  const onDatabaseChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes and loads existing WebDAV config on mount', async () => {
    vi.mocked(syncModule.hasSyncConfig).mockReturnValueOnce(true);
    vi.mocked(syncModule.loadSyncConfig).mockResolvedValueOnce({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'user1',
      password: 'pass1',
    });

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    await act(async () => {
      // Allow async effect to complete
    });

    expect(result.current.syncProvider).toBe('webdav');
    expect(result.current.syncUrl).toBe('https://dav.example.com');
    expect(result.current.syncUsername).toBe('user1');
  });

  it('tests WebDAV connection and reports success', async () => {
    vi.mocked(syncModule.validateWebDavConfig).mockReturnValueOnce(null);

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    act(() => {
      result.current.setSyncProvider('webdav');
      result.current.setSyncUrl('https://dav.example.com');
      result.current.setSyncUsername('user1');
      result.current.setSyncPassword('pass1');
    });

    await act(async () => {
      await result.current.onSyncTest();
    });

    expect(result.current.syncTestSucceeded).toBe(true);
  });

  it('tests S3 connection and reports failure', async () => {
    vi.mocked(syncModule.validateS3Config).mockReturnValueOnce(null);
    vi.spyOn(syncModule.S3SyncProvider.prototype, 'testConnection').mockRejectedValueOnce(
      new Error('Bucket not found'),
    );

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    act(() => {
      result.current.setSyncProvider('s3');
      result.current.setS3Bucket('my-bucket');
    });

    await act(async () => {
      await result.current.onSyncTest();
    });

    expect(result.current.syncTestSucceeded).toBe(false);
    expect(result.current.syncTestResult).toContain('Bucket not found');
  });

  it('saves WebDAV sync configuration', async () => {
    vi.mocked(syncModule.validateWebDavConfig).mockReturnValueOnce(null);

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    act(() => {
      result.current.setSyncProvider('webdav');
      result.current.setSyncUrl('https://dav.example.com');
    });

    await act(async () => {
      await result.current.onSyncSave();
    });

    expect(syncModule.saveSyncConfig).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'webdav', url: 'https://dav.example.com' }),
      'mock-password-123',
    );
  });

  it('saves S3 sync configuration', async () => {
    vi.mocked(syncModule.validateS3Config).mockReturnValueOnce(null);

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    act(() => {
      result.current.setSyncProvider('s3');
      result.current.setS3Bucket('aegis-vault');
    });

    await act(async () => {
      await result.current.onSyncSave();
    });

    expect(syncModule.saveSyncConfig).toHaveBeenCalledWith(
      expect.objectContaining({ type: 's3', bucket: 'aegis-vault' }),
      'mock-password-123',
    );
  });

  it('disables sync and clears form state', async () => {
    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    act(() => {
      result.current.setSyncProvider('webdav');
      result.current.setSyncUrl('https://dav.example.com');
    });

    await act(async () => {
      await result.current.onSyncDisable();
    });

    expect(syncModule.clearSyncConfig).toHaveBeenCalled();
    expect(result.current.syncProvider).toBe('disabled');
    expect(result.current.syncUrl).toBe('');
  });

  it('performs manual sync with merged items successfully', async () => {
    vi.mocked(syncModule.loadSyncConfig).mockResolvedValueOnce({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'u',
      password: 'p',
    });
    vi.mocked(syncModule.createSyncProvider).mockReturnValueOnce({} as any);
    vi.mocked(syncModule.performSync).mockResolvedValueOnce({
      status: 'success',
      mergedItems: [{ id: 'item-1', title: 'Test Item' } as any],
      mergedCount: 1,
      conflicts: [],
    });

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    await act(async () => {
      await result.current.onSyncNow();
    });

    expect(result.current.syncStatus).toBe('success');
    expect(storageModule.saveVaultItems).toHaveBeenCalled();
    expect(onDatabaseChanged).toHaveBeenCalled();
    expect(syncModule.saveLastSyncTime).toHaveBeenCalled();
  });

  it('handles sync error and displays appropriate error message', async () => {
    vi.mocked(syncModule.loadSyncConfig).mockResolvedValueOnce({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'u',
      password: 'p',
    });
    vi.mocked(syncModule.createSyncProvider).mockReturnValueOnce({} as any);
    vi.mocked(syncModule.performSync).mockResolvedValueOnce({
      status: 'error',
      error: { code: 'sync.authFailed', message: 'Unauthorized' } as any,
    } as any);

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    await act(async () => {
      await result.current.onSyncNow();
    });

    expect(result.current.syncStatus).toBe('error');
  });

  it('handles upload, download, and checksum sync errors', async () => {
    vi.mocked(syncModule.loadSyncConfig).mockResolvedValue({
      type: 'webdav',
      url: 'https://dav.example.com',
      username: 'u',
      password: 'p',
    });
    vi.mocked(syncModule.createSyncProvider).mockReturnValue({} as any);

    // Upload error
    vi.mocked(syncModule.performSync).mockResolvedValueOnce({
      status: 'error',
      error: { code: 'sync.uploadFailed', message: 'Upload Failed' } as any,
    } as any);

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    await act(async () => {
      await result.current.onSyncNow();
    });
    expect(result.current.syncStatus).toBe('error');

    // Download error
    vi.mocked(syncModule.performSync).mockResolvedValueOnce({
      status: 'error',
      error: { code: 'sync.downloadFailed', message: 'Download Failed' } as any,
    } as any);

    await act(async () => {
      await result.current.onSyncNow();
    });
    expect(result.current.syncStatus).toBe('error');

    // Checksum error
    vi.mocked(syncModule.performSync).mockResolvedValueOnce({
      status: 'error',
      error: { code: 'sync.checksumMismatch', message: 'Checksum Failed' } as any,
    } as any);

    await act(async () => {
      await result.current.onSyncNow();
    });
    expect(result.current.syncStatus).toBe('error');
  });

  it('handles unhandled throw during sync', async () => {
    vi.mocked(syncModule.loadSyncConfig).mockRejectedValueOnce(new Error('Network offline'));

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    await act(async () => {
      await result.current.onSyncNow();
    });

    expect(result.current.syncStatus).toBe('error');
    expect(result.current.syncMessage).toBe('Network offline');
  });

  it('loads, validates, tests and saves S3 sync config', async () => {
    vi.mocked(syncModule.hasSyncConfig).mockReturnValueOnce(true);
    vi.mocked(syncModule.loadSyncConfig).mockResolvedValueOnce({
      type: 's3',
      endpoint: 'https://s3.example.com',
      region: 'us-east-1',
      bucket: 'vault-bucket',
      accessKeyId: 'AKIA123',
      secretAccessKey: 'secret123',
    });

    const { result } = renderHook(() => useSettingsSync({ onDatabaseChanged }), { wrapper });

    await act(async () => {});

    expect(result.current.syncProvider).toBe('s3');
    expect(result.current.s3Endpoint).toBe('https://s3.example.com');
    expect(result.current.s3Region).toBe('us-east-1');
    expect(result.current.s3Bucket).toBe('vault-bucket');

    // Validation error on test
    vi.mocked(syncModule.validateS3Config).mockReturnValueOnce('Invalid S3 bucket');
    await act(async () => {
      await result.current.onSyncTest();
    });
    expect(result.current.syncTestResult).toContain('Invalid S3 bucket');

    // Success on test
    vi.mocked(syncModule.validateS3Config).mockReturnValueOnce(null);
    await act(async () => {
      await result.current.onSyncTest();
    });
    expect(result.current.syncTestSucceeded).toBe(true);

    // Save S3 config
    vi.mocked(syncModule.validateS3Config).mockReturnValueOnce(null);
    await act(async () => {
      await result.current.onSyncSave();
    });
    expect(syncModule.saveSyncConfig).toHaveBeenCalled();
  });
});
