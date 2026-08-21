/**
 * @vitest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSettingsPasskey } from './useSettingsPasskey';
import * as passkeyModule from '../lib/passkey';
import * as storageModule from '../lib/storage';
import { LanguageProvider } from '../i18n/LanguageContext';
import React from 'react';
import type { VaultItem } from '../types';

vi.mock('../lib/passkey', async () => {
  const actual = await vi.importActual<typeof passkeyModule>('../lib/passkey');
  return {
    ...actual,
    registerPasskey: vi.fn(),
    authenticateAndIncrementPasskey: vi.fn(),
    recordToVaultFields: vi.fn(() => ({ passkeyCredentialId: 'cred-123' })),
    vaultFieldsToRecord: vi.fn(),
  };
});

vi.mock('../lib/storage', async () => {
  const actual = await vi.importActual<typeof storageModule>('../lib/storage');
  return {
    ...actual,
    saveVaultItem: vi.fn(),
    saveVaultItems: vi.fn(),
    getVaultItems: vi.fn(),
    deleteVaultItem: vi.fn(),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useSettingsPasskey', () => {
  let mockItems: VaultItem[] = [];
  const setItems = vi.fn((update) => {
    if (typeof update === 'function') {
      mockItems = update(mockItems);
    } else {
      mockItems = update;
    }
  });
  const onDatabaseChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockItems = [];
  });

  it('successfully creates a passkey and updates items list', async () => {
    const mockRecord = {
      itemId: 'item-pass-1',
      rpId: 'example.com',
      rpName: 'Example',
      userName: 'alice@example.com',
      credentialId: 'cred-123',
      signCount: 0,
    } as any;

    vi.mocked(passkeyModule.registerPasskey).mockResolvedValueOnce({
      record: mockRecord,
    } as any);

    vi.mocked(storageModule.saveVaultItem).mockResolvedValueOnce([
      { id: 'item-pass-1', title: 'Example', category: 'passkey' } as VaultItem,
    ]);

    const { result } = renderHook(
      () => useSettingsPasskey({ items: mockItems, setItems, onDatabaseChanged }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleCreatePasskey({
        rpId: 'example.com',
        userName: 'alice@example.com',
      } as any);
    });

    expect(result.current.passkeyStatusKey).toBe('passkey.create.success');
    expect(result.current.passkeyStatusKind).toBe('success');
    expect(onDatabaseChanged).toHaveBeenCalled();
  });

  it('maps passkey creation errors properly', async () => {
    vi.mocked(passkeyModule.registerPasskey).mockRejectedValueOnce(
      new passkeyModule.PasskeyError(passkeyModule.passkeyErrorCodes.createCancelled),
    );

    const { result } = renderHook(
      () => useSettingsPasskey({ items: mockItems, setItems, onDatabaseChanged }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleCreatePasskey({
        rpId: 'example.com',
        userName: 'alice@example.com',
      } as any);
    });

    expect(result.current.passkeyStatusKey).toBe('passkey.create.cancelled');
    expect(result.current.passkeyStatusKind).toBe('error');

    // Test other error codes
    const errorCodes = [
      { code: passkeyModule.passkeyErrorCodes.rpIdOriginMismatch, expected: 'passkey.create.rpIdOriginMismatch' },
      { code: passkeyModule.passkeyErrorCodes.missingRpId, expected: 'passkey.create.missingRpId' },
      { code: passkeyModule.passkeyErrorCodes.missingUserName, expected: 'passkey.create.missingUserName' },
      { code: passkeyModule.passkeyErrorCodes.unsupportedAlgorithm, expected: 'passkey.create.unsupportedAlgorithm' },
      { code: passkeyModule.passkeyErrorCodes.sessionMissing, expected: 'passkey.create.sessionMissing' },
      { code: passkeyModule.passkeyErrorCodes.unsupported, expected: 'passkey.create.failed' },
    ];

    for (const { code, expected } of errorCodes) {
      vi.mocked(passkeyModule.registerPasskey).mockRejectedValueOnce(
        new passkeyModule.PasskeyError(code),
      );
      await act(async () => {
        await result.current.handleCreatePasskey({ rpId: 'x', userName: 'u' } as any);
      });
      expect(result.current.passkeyStatusKey).toBe(expected);
    }
  });

  it('authenticates a passkey and increments sign count', async () => {
    const existingItem: VaultItem = {
      id: 'item-pass-1',
      title: 'Example',
      username: 'alice',
      password: '',
      url: '',
      category: 'passkey',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
      passkeySignCount: 0,
    };

    mockItems = [existingItem];
    vi.mocked(storageModule.getVaultItems).mockResolvedValueOnce([existingItem]);
    vi.mocked(passkeyModule.authenticateAndIncrementPasskey).mockResolvedValueOnce({
      assertion: {} as any,
      updatedRecord: { signCount: 1, lastUsedAt: '2026-01-02' } as any,
    });
    vi.mocked(storageModule.saveVaultItems).mockResolvedValueOnce([
      { ...existingItem, passkeySignCount: 1 },
    ]);

    const { result } = renderHook(
      () => useSettingsPasskey({ items: mockItems, setItems, onDatabaseChanged }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleAuthenticatePasskey({ itemId: 'item-pass-1' } as any);
    });

    expect(result.current.passkeyStatusKey).toBe('passkey.authenticate.success');
    expect(result.current.passkeyStatusKind).toBe('success');
    expect(onDatabaseChanged).toHaveBeenCalled();
  });

  it('handles passkey delete with user confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    vi.mocked(storageModule.deleteVaultItem).mockResolvedValueOnce([]);

    const { result } = renderHook(
      () => useSettingsPasskey({ items: mockItems, setItems, onDatabaseChanged }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleDeletePasskey({ itemId: 'item-pass-1' } as any);
    });

    expect(result.current.passkeyStatusKey).toBe('passkey.delete.success');
    expect(result.current.passkeyStatusKind).toBe('success');
  });

  it('cancels passkey delete when user declines confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);

    const { result } = renderHook(
      () => useSettingsPasskey({ items: mockItems, setItems, onDatabaseChanged }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleDeletePasskey({ itemId: 'item-pass-1' } as any);
    });

    expect(result.current.passkeyStatusKey).toBeNull();
    expect(storageModule.deleteVaultItem).not.toHaveBeenCalled();
  });

  it('handles passkey authentication errors', async () => {
    vi.mocked(passkeyModule.authenticateAndIncrementPasskey).mockRejectedValueOnce(
      new passkeyModule.PasskeyError(passkeyModule.passkeyErrorCodes.createCancelled),
    );

    const { result } = renderHook(
      () => useSettingsPasskey({ items: mockItems, setItems, onDatabaseChanged }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleAuthenticatePasskey({ itemId: 'item-pass-1' } as any);
    });

    expect(result.current.passkeyStatusKey).toBe('passkey.authenticate.cancelled');
    expect(result.current.passkeyStatusKind).toBe('error');
  });

  it('handles passkey delete error by resetting items', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    vi.mocked(storageModule.deleteVaultItem).mockRejectedValueOnce(new Error('delete failed'));
    vi.mocked(storageModule.getVaultItems).mockResolvedValueOnce(mockItems);

    const { result } = renderHook(
      () => useSettingsPasskey({ items: mockItems, setItems, onDatabaseChanged }),
      { wrapper },
    );

    await act(async () => {
      await result.current.handleDeletePasskey({ itemId: 'item-pass-1' } as any);
    });

    expect(result.current.passkeyStatusKey).toBe('passkey.delete.failed');
    expect(result.current.passkeyStatusKind).toBe('error');
  });
});
