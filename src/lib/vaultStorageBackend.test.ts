/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { parseVaultStorageBackendSelection } from './vaultStorageBackend';

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

  it('fails closed when wa-sqlite is requested as the active backend', () => {
    expect(() => parseVaultStorageBackendSelection('wa-sqlite')).toThrow(
      'vault-storage-backend-wa-sqlite-not-ready',
    );
    expect(() => parseVaultStorageBackendSelection('sqlite')).toThrow(
      'vault-storage-backend-wa-sqlite-not-ready',
    );
  });

  it('rejects unsupported backend names instead of silently falling back', () => {
    expect(() => parseVaultStorageBackendSelection('indexeddb')).toThrow(
      'vault-storage-backend-unsupported',
    );
  });
});
