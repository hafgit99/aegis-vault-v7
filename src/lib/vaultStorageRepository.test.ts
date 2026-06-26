// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { sqliteOPFSInstance } from './sqlite_opfs';
import type { VaultStorageRepository } from './vaultStorageRepository';

describe('vault storage repository contract', () => {
  it('exposes the active storage backend through the repository contract', () => {
    const repository: VaultStorageRepository = sqliteOPFSInstance;

    expect(repository).toMatchObject({
      hydrate: expect.any(Function),
      clearDerivedKeyCache: expect.any(Function),
      subscribeLogs: expect.any(Function),
      getQueryLogs: expect.any(Function),
      logQuery: expect.any(Function),
      verifyPassword: expect.any(Function),
      setupMaster: expect.any(Function),
      changeMasterPassword: expect.any(Function),
      deriveEncryptionKey: expect.any(Function),
      getVaultItems: expect.any(Function),
      saveVaultItem: expect.any(Function),
      saveVaultItems: expect.any(Function),
      executeCustomSQL: expect.any(Function),
      resetAll: expect.any(Function),
      deletePermanently: expect.any(Function),
      deletePermanentlyBatch: expect.any(Function),
      reseedDemo: expect.any(Function),
    });
  });
});
