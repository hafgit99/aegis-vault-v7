/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { WaSqliteEngine } from './waSqliteEngine';
import {
  createWaSqliteVaultStorageRepository,
  WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR,
  WA_SQLITE_WRITE_NOT_READY_ERROR,
} from './waSqliteVaultStorageRepository';

vi.mock('./argon2id', () => ({
  createArgon2idHash: vi.fn(async (password: string, salt: string) => `$argon2id$${salt}$${password}`),
  verifyArgon2idHash: vi.fn(async (password: string, encodedHash: string) => encodedHash.endsWith(`$${password}`)),
  deriveArgon2idKey: vi.fn(async () => new Uint8Array(32).fill(7)),
}));

vi.mock('./random', () => ({
  secureRandomToken: vi.fn(() => 'fixedsalt'),
}));

function createEngineStub(): WaSqliteEngine & {
  userSecretHash: string | null;
  vaultRows: Array<Record<string, unknown>>;
} {
  const state = {
    userSecretHash: null as string | null,
    vaultRows: [] as Array<Record<string, unknown>>,
  };

  return {
    get userSecretHash() {
      return state.userSecretHash;
    },
    set userSecretHash(value: string | null) {
      state.userSecretHash = value;
    },
    get vaultRows() {
      return state.vaultRows;
    },
    set vaultRows(value: Array<Record<string, unknown>>) {
      state.vaultRows = value;
    },
    initialize: vi.fn(async () => ({ initialized: true, databaseName: 'wa-test.db', tableCount: 3 })),
    execute: vi.fn(async (sql: string) => {
      if (sql.startsWith('DELETE FROM user_secrets')) {
        state.userSecretHash = null;
      }

      if (sql.startsWith('INSERT INTO user_secrets')) {
        state.userSecretHash = '$argon2id$fixedsalt$valid-master';
      }

      return { columns: [], rows: [] };
    }),
    executeReadOnly: vi.fn(async () => ({ columns: [], rows: [] })),
    selectObjects: vi.fn(async (sql: string) => {
      if (sql.includes('FROM user_secrets')) {
        return state.userSecretHash ? [{ argon_hash: state.userSecretHash }] : [];
      }

      if (sql.includes('FROM vault_items')) {
        return state.vaultRows;
      }

      return [];
    }),
    close: vi.fn(async () => undefined),
  };
}

describe('wa-sqlite vault storage repository', () => {
  it('hydrates the engine and supports log subscriptions', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    const onLogChanged = vi.fn();
    const unsubscribe = repository.subscribeLogs(onLogChanged);

    await repository.hydrate();
    unsubscribe();
    repository.logQuery('SELECT 1;', 'SUCCESS', 1);

    expect(engine.initialize).toHaveBeenCalledOnce();
    expect(onLogChanged).toHaveBeenCalledOnce();
    expect(repository.getQueryLogs()[1]).toMatchObject({ status: 'SUCCESS', rowsAffected: 3 });
  });

  it('sets up and verifies the owner master password with Argon2id metadata', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });

    await repository.setupMaster('valid-master');

    expect(engine.execute).toHaveBeenCalledWith('DELETE FROM user_secrets;');
    expect(engine.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO user_secrets'));
    expect(engine.userSecretHash).toBe('$argon2id$fixedsalt$valid-master');
    await expect(repository.verifyPassword('valid-master')).resolves.toBe(true);
    await expect(repository.verifyPassword('wrong-master')).resolves.toBe(false);
    expect(repository.getQueryLogs().some((entry) => entry.query.includes('valid-master'))).toBe(false);
  });

  it('reads vault item metadata only after master password verification', async () => {
    const engine = createEngineStub();
    engine.userSecretHash = '$argon2id$fixedsalt$valid-master';
    engine.vaultRows = [
      {
        id: 'item-1',
        title: 'Example',
        category: 'secure_note',
        favorite: 1,
        deleted: 0,
        deleted_at: null,
        created_at: '2026-01-01',
        updated_at: '2026-01-02',
      },
    ];
    const repository = createWaSqliteVaultStorageRepository({ engine });

    await expect(repository.getVaultItems('valid-master')).resolves.toEqual([
      {
        id: 'item-1',
        title: 'Example',
        username: '',
        url: '',
        category: 'secure_note',
        favorite: true,
        deleted: false,
        deletedAt: undefined,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
      },
    ]);

    await expect(repository.getVaultItems('wrong-master')).rejects.toThrow(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
  });

  it('derives keys without caching plaintext passwords as map keys', async () => {
    const repository = createWaSqliteVaultStorageRepository({ engine: createEngineStub() });

    await expect(repository.deriveEncryptionKey('valid-master', 'salt')).resolves.toEqual(new Uint8Array(32).fill(7));
    repository.clearDerivedKeyCache();
  });

  it('keeps vault item writes and custom SQL fail-closed until encrypted row writes are ready', async () => {
    const repository = createWaSqliteVaultStorageRepository({ engine: createEngineStub() });

    await expect(repository.saveVaultItems([], 'valid-master')).rejects.toThrow(WA_SQLITE_WRITE_NOT_READY_ERROR);
    await expect(repository.saveVaultItem({ id: 'item-1' } as never, 'valid-master')).rejects.toThrow(WA_SQLITE_WRITE_NOT_READY_ERROR);
    await expect(repository.changeMasterPassword('old', 'new')).rejects.toThrow(WA_SQLITE_WRITE_NOT_READY_ERROR);
    await expect(repository.resetAll()).rejects.toThrow(WA_SQLITE_WRITE_NOT_READY_ERROR);
    await expect(repository.deletePermanently('item-1', 'valid-master')).rejects.toThrow(WA_SQLITE_WRITE_NOT_READY_ERROR);
    await expect(repository.deletePermanentlyBatch(['item-1'], 'valid-master')).rejects.toThrow(WA_SQLITE_WRITE_NOT_READY_ERROR);
    await expect(repository.reseedDemo('valid-master', [])).rejects.toThrow(WA_SQLITE_WRITE_NOT_READY_ERROR);
    expect(repository.executeCustomSQL('SELECT * FROM vault_items;', 'valid-master')).toEqual({
      columns: [],
      rows: [],
      error: WA_SQLITE_WRITE_NOT_READY_ERROR,
    });
  });
});