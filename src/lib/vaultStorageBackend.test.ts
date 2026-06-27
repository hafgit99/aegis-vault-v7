/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseVaultStorageBackendSelection, VaultStorageBackendSelectionError } from './vaultStorageBackend';

describe('vault storage backend selection', () => {
  it('keeps OPFS active by default', () => {
    expect(parseVaultStorageBackendSelection(undefined)).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
    expect(parseVaultStorageBackendSelection('opfs')).toEqual({
      active: 'opfs',
      target: null,
      mode: 'active',
    });
  });

  it('allows wa-sqlite only as an explicit dry-run target for now', () => {
    expect(parseVaultStorageBackendSelection('wa-sqlite-dry-run')).toEqual({
      active: 'opfs',
      target: 'wa-sqlite',
      mode: 'dry-run',
    });
  });

  it('fails closed when wa-sqlite is requested as the active backend without readiness evidence', () => {
    expect(() => parseVaultStorageBackendSelection('wa-sqlite')).toThrow(
      'vault-storage-backend-wa-sqlite-not-ready',
    );

    try {
      parseVaultStorageBackendSelection('sqlite');
      throw new Error('expected selection to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(VaultStorageBackendSelectionError);
      expect((error as VaultStorageBackendSelectionError).issues).toEqual([
        'wa-sqlite-promotion-readiness-not-provided',
        'wa-sqlite-active-provider-not-enabled',
      ]);
    }
  });

  it('surfaces wa-sqlite promotion readiness blockers when active selection is requested', () => {
    expect(() => parseVaultStorageBackendSelection('wa-sqlite', {
      waSqlitePromotionReadiness: {
        status: 'blocked',
        issues: ['wa-sqlite-promotion-smoke-not-run'],
      },
      activeWaSqliteProviderEnabled: true,
    })).toThrow('vault-storage-backend-wa-sqlite-not-ready');

    try {
      parseVaultStorageBackendSelection('wa-sqlite', {
        waSqlitePromotionReadiness: {
          status: 'blocked',
          issues: ['wa-sqlite-promotion-smoke-not-run'],
        },
        activeWaSqliteProviderEnabled: true,
      });
      throw new Error('expected selection to fail');
    } catch (error) {
      expect((error as VaultStorageBackendSelectionError).issues).toEqual([
        'wa-sqlite-promotion-smoke-not-run',
      ]);
    }
  });

  it('can describe the future active wa-sqlite selection when all explicit gates are open', () => {
    expect(parseVaultStorageBackendSelection('wa-sqlite', {
      waSqlitePromotionReadiness: { status: 'ready', issues: [] },
      activeWaSqliteProviderEnabled: true,
    })).toEqual({
      active: 'wa-sqlite',
      target: null,
      mode: 'active',
    });
  });

  it('rejects unsupported backend names instead of silently falling back', () => {
    expect(() => parseVaultStorageBackendSelection('indexeddb')).toThrow(
      'vault-storage-backend-unsupported',
    );

    try {
      parseVaultStorageBackendSelection('indexeddb');
      throw new Error('expected selection to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(VaultStorageBackendSelectionError);
      expect((error as VaultStorageBackendSelectionError).issues).toEqual([
        'vault-storage-backend-unsupported',
      ]);
    }
  });
});
