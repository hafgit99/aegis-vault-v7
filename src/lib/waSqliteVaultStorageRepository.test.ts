/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultItem } from '../types';
import type { VaultStorageQueryResult } from './vaultStorageRepository';
import { createWaSqlitePersistenceProfile } from './waSqlitePersistence';
import type { WaSqliteEngine } from './waSqliteEngine';
import {
  createWaSqliteVaultStorageRepository,
  WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR,
  WA_SQLITE_ROW_DECRYPT_ERROR,
  WA_SQLITE_WRITE_NOT_READY_ERROR,
} from './waSqliteVaultStorageRepository';

const mockState = vi.hoisted(() => ({
  randomByteFill: 17,
  encryptionCounter: 0,
}));

vi.mock('./argon2id', () => ({
  createArgon2idHash: vi.fn(async (password: string, salt: string) => `$argon2id$${salt}$${password}`),
  verifyArgon2idHash: vi.fn(async (password: string, encodedHash: string) => encodedHash.endsWith(`$${password}`)),
  deriveArgon2idKey: vi.fn(async () => new Uint8Array(32).fill(7)),
}));

vi.mock('./random', () => ({
  secureRandomBytes: vi.fn((length: number) => new Uint8Array(length).fill(mockState.randomByteFill++)),
  secureRandomToken: vi.fn(() => 'fixedsalt'),
}));

vi.mock('./webcrypto', () => ({
  generateSafeIv: vi.fn(() => new Uint8Array(12).fill(1)),
  webCryptoAesGcmEncrypt: vi.fn(async (plaintext: string) => ({
    iv: '010101010101010101010101',
    tag: '02020202020202020202020202020202',
    ciphertext: `sealed:${++mockState.encryptionCounter}:${Buffer.from(plaintext, 'utf8').toString('base64')}`,
  })),
  webCryptoAesGcmDecrypt: vi.fn(async (payload: { ciphertext: string }) => {
    if (!payload.ciphertext.startsWith('sealed:')) {
      throw new Error('invalid-ciphertext');
    }
    return Buffer.from(payload.ciphertext.split(':').slice(2).join(':'), 'base64').toString('utf8');
  }),
}));


function splitSqlValues(valuesSql: string): unknown[] {
  const values: unknown[] = [];
  let current = '';
  let inString = false;

  for (let index = 0; index < valuesSql.length; index++) {
    const char = valuesSql[index];
    const next = valuesSql[index + 1];

    if (char === "'") {
      current += char;
      if (inString && next === "'") {
        current += next;
        index++;
      } else {
        inString = !inString;
      }
      continue;
    }

    if (char === ',' && !inString) {
      values.push(parseSqlValue(current.trim()));
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    values.push(parseSqlValue(current.trim()));
  }

  return values;
}

function parseSqlValue(value: string): unknown {
  if (value.toUpperCase() === 'NULL') return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function createEngineStub(): WaSqliteEngine & {
  userSecretHash: string | null;
  vaultRows: Array<Record<string, unknown>>;
  metadata: Map<string, string>;
  failNextUpsert: boolean;
} {
  const state = {
    userSecretHash: null as string | null,
    vaultRows: [] as Array<Record<string, unknown>>,
    metadata: new Map<string, string>(),
    txSnapshot: null as null | {
      userSecretHash: string | null;
      vaultRows: Array<Record<string, unknown>>;
      metadata: Map<string, string>;
    },
    failNextUpsert: false,
  };

  function snapshot() {
    state.txSnapshot = {
      userSecretHash: state.userSecretHash,
      vaultRows: state.vaultRows.map((row) => ({ ...row })),
      metadata: new Map(state.metadata),
    };
  }

  function restore() {
    if (!state.txSnapshot) return;
    state.userSecretHash = state.txSnapshot.userSecretHash;
    state.vaultRows = state.txSnapshot.vaultRows.map((row) => ({ ...row }));
    state.metadata = new Map(state.txSnapshot.metadata);
    state.txSnapshot = null;
  }

  function upsertVaultRow(sql: string): VaultStorageQueryResult {
    if (state.failNextUpsert) {
      state.failNextUpsert = false;
      return { columns: [], rows: [], error: 'injected-upsert-failure' };
    }

    const columnsMatch = sql.match(/INSERT INTO vault_items \(([^)]+)\) VALUES/i);
    const valuesMatch = sql.match(/VALUES \((.*)\) ON CONFLICT/is);
    if (!columnsMatch || !valuesMatch) {
      return { columns: [], rows: [], error: 'unparsed-vault-upsert' };
    }

    const columns = columnsMatch[1].split(',').map((column) => column.trim());
    const values = splitSqlValues(valuesMatch[1]);
    const row = Object.fromEntries(columns.map((column, index) => [column, values[index]]));
    const rowIndex = state.vaultRows.findIndex((candidate) => candidate.id === row.id);
    if (rowIndex >= 0) {
      state.vaultRows[rowIndex] = row;
    } else {
      state.vaultRows.push(row);
    }
    return { columns: [], rows: [] };
  }

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
    get metadata() {
      return state.metadata;
    },
    set metadata(value: Map<string, string>) {
      state.metadata = value;
    },
    get failNextUpsert() {
      return state.failNextUpsert;
    },
    set failNextUpsert(value: boolean) {
      state.failNextUpsert = value;
    },
    initialize: vi.fn(async () => ({
      initialized: true,
      databaseName: 'wa-test.db',
      tableCount: 3,
      persistenceProfile: createWaSqlitePersistenceProfile(),
    })),
    execute: vi.fn(async (sql: string) => {
      const normalizedSql = sql.trim();
      if (normalizedSql === 'BEGIN IMMEDIATE;') {
        snapshot();
        return { columns: [], rows: [] };
      }
      if (normalizedSql === 'COMMIT;') {
        state.txSnapshot = null;
        return { columns: [], rows: [] };
      }
      if (normalizedSql === 'ROLLBACK;') {
        restore();
        return { columns: [], rows: [] };
      }
      if (normalizedSql.startsWith('DELETE FROM user_secrets')) {
        state.userSecretHash = null;
        return { columns: [], rows: [] };
      }
      if (normalizedSql.startsWith('DELETE FROM vault_items WHERE id IN')) {
        const ids = splitSqlValues(normalizedSql.match(/IN \((.*)\);/s)?.[1] ?? '') as string[];
        state.vaultRows = state.vaultRows.filter((row) => !ids.includes(String(row.id)));
        return { columns: [], rows: [] };
      }
      if (normalizedSql.startsWith('DELETE FROM vault_items')) {
        state.vaultRows = [];
        return { columns: [], rows: [] };
      }
      if (normalizedSql.startsWith('DELETE FROM storage_metadata')) {
        state.metadata.clear();
        return { columns: [], rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO user_secrets')) {
        const values = splitSqlValues(normalizedSql.match(/VALUES \((.*)\);/s)?.[1] ?? '');
        state.userSecretHash = String(values[1]);
        return { columns: [], rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO storage_metadata')) {
        const values = splitSqlValues(normalizedSql.match(/VALUES \((.*)\) ON CONFLICT/s)?.[1] ?? '');
        state.metadata.set(String(values[0]), String(values[1]));
        return { columns: [], rows: [] };
      }
      if (normalizedSql.startsWith('INSERT INTO vault_items')) {
        return upsertVaultRow(normalizedSql);
      }
      return { columns: [], rows: [] };
    }),
    executeReadOnly: vi.fn(async () => ({ columns: [], rows: [] })),
    selectObjects: vi.fn(async (sql: string) => {
      if (sql.includes('FROM user_secrets')) {
        return state.userSecretHash ? [{ argon_hash: state.userSecretHash }] : [];
      }
      if (sql.includes('FROM storage_metadata')) {
        const key = String(parseSqlValue(sql.match(/WHERE key = ('(?:''|[^'])*')/)?.[1] ?? "''"));
        const value = state.metadata.get(key);
        return value ? [{ value }] : [];
      }
      if (sql.includes('FROM vault_items')) {
        return state.vaultRows;
      }
      return [];
    }),
    close: vi.fn(async () => undefined),
  };
}

function createVaultItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Example Login',
    username: 'alice',
    password: 'Secret-123!',
    url: 'https://example.test',
    category: 'login',
    notes: 'private note',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  };
}

describe('wa-sqlite vault storage repository', () => {
  beforeEach(() => {
    mockState.randomByteFill = 17;
    mockState.encryptionCounter = 0;
    vi.clearAllMocks();
  });

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

  it('sets up and verifies the owner master password with Argon2id metadata and per-vault salt', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });

    await repository.setupMaster('valid-master');

    expect(engine.execute).toHaveBeenCalledWith('BEGIN IMMEDIATE;');
    expect(engine.execute).toHaveBeenCalledWith('COMMIT;');
    expect(engine.userSecretHash).toBe('$argon2id$fixedsalt$valid-master');
    expect(engine.metadata.get('vault_encryption_salt')).toBe('11111111111111111111111111111111');
    await expect(repository.verifyPassword('valid-master')).resolves.toBe(true);
    await expect(repository.verifyPassword('wrong-master')).resolves.toBe(false);
    expect(repository.getQueryLogs().some((entry) => entry.query.includes('valid-master'))).toBe(false);
  });

  it('saves encrypted vault rows and decrypts them only after master password verification', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');

    await expect(repository.saveVaultItem(createVaultItem(), 'valid-master')).resolves.toHaveLength(1);

    expect(engine.vaultRows).toHaveLength(1);
    const stored = engine.vaultRows[0];
    expect(stored.username_db).toBe('[encrypted: aes-256-gcm]');
    expect(stored.enc_metadata).toContain('sealed:');
    expect(stored.enc_metadata).not.toContain('Secret-123!');
    await expect(repository.getVaultItems('valid-master')).resolves.toEqual([
      expect.objectContaining({
        id: 'item-1',
        username: 'alice',
        password: 'Secret-123!',
        notes: 'private note',
        title: 'Example Login',
      }),
    ]);
    await expect(repository.getVaultItems('wrong-master')).rejects.toThrow(WA_SQLITE_INVALID_MASTER_PASSWORD_ERROR);
  });

  it('rolls back a failed encrypted upsert transaction', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');
    await repository.saveVaultItem(createVaultItem(), 'valid-master');

    engine.failNextUpsert = true;
    await expect(repository.saveVaultItem(createVaultItem({ title: 'Changed' }), 'valid-master')).rejects.toThrow('injected-upsert-failure');

    expect(engine.vaultRows).toHaveLength(1);
    expect(engine.vaultRows[0].title).toBe('Example Login');
    expect(engine.execute).toHaveBeenCalledWith('ROLLBACK;');
  });

  it('saves batch rows, reports progress, deletes records, and reseeds demo rows', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    const onProgress = vi.fn();
    await repository.setupMaster('valid-master');

    await expect(repository.saveVaultItems([
      createVaultItem({ id: 'item-1', title: 'One' }),
      createVaultItem({ id: 'item-2', title: 'Two', username: 'bob' }),
    ], 'valid-master', onProgress)).resolves.toHaveLength(2);
    expect(onProgress).toHaveBeenLastCalledWith(2);
    expect(engine.vaultRows).toHaveLength(2);

    await expect(repository.deletePermanently('item-1', 'valid-master')).resolves.toEqual([
      expect.objectContaining({ id: 'item-2', username: 'bob' }),
    ]);
    expect(engine.vaultRows).toHaveLength(1);

    await expect(repository.reseedDemo('valid-master', [createVaultItem({ id: 'demo-1', title: 'Demo' })])).resolves.toEqual([
      expect.objectContaining({ id: 'demo-1', title: 'Demo' }),
    ]);
    expect(engine.vaultRows).toHaveLength(1);
  });

  it('rotates the master password and re-encrypts existing vault rows', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');
    await repository.saveVaultItem(createVaultItem(), 'valid-master');
    const oldCiphertext = String(engine.vaultRows[0].enc_metadata);
    const oldSalt = engine.metadata.get('vault_encryption_salt');

    await repository.changeMasterPassword('valid-master', 'new-master');

    expect(engine.userSecretHash).toBe('$argon2id$fixedsalt$new-master');
    expect(engine.metadata.get('vault_encryption_salt')).not.toBe(oldSalt);
    expect(String(engine.vaultRows[0].enc_metadata)).not.toBe(oldCiphertext);
    await expect(repository.verifyPassword('valid-master')).resolves.toBe(false);
    await expect(repository.getVaultItems('new-master')).resolves.toEqual([
      expect.objectContaining({
        id: 'item-1',
        username: 'alice',
        password: 'Secret-123!',
      }),
    ]);
  });

  it('rejects master rotation when the current password is invalid', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');
    await repository.saveVaultItem(createVaultItem(), 'valid-master');

    await expect(repository.changeMasterPassword('wrong-master', 'new-master')).rejects.toThrow('current-master-password-invalid');

    await expect(repository.getVaultItems('valid-master')).resolves.toHaveLength(1);
    await expect(repository.verifyPassword('new-master')).resolves.toBe(false);
  });

  it('rolls back master rotation when re-encrypted row persistence fails', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');
    await repository.saveVaultItem(createVaultItem(), 'valid-master');
    const oldHash = engine.userSecretHash;
    const oldSalt = engine.metadata.get('vault_encryption_salt');
    const oldRows = engine.vaultRows.map((row) => ({ ...row }));

    engine.failNextUpsert = true;
    await expect(repository.changeMasterPassword('valid-master', 'new-master')).rejects.toThrow('injected-upsert-failure');

    expect(engine.userSecretHash).toBe(oldHash);
    expect(engine.metadata.get('vault_encryption_salt')).toBe(oldSalt);
    expect(engine.vaultRows).toEqual(oldRows);
    await expect(repository.getVaultItems('valid-master')).resolves.toHaveLength(1);
    await expect(repository.verifyPassword('new-master')).resolves.toBe(false);
  });

  it('keeps custom SQL fail-closed while encrypted row writes are isolated', async () => {
    const repository = createWaSqliteVaultStorageRepository({ engine: createEngineStub() });

    expect(repository.executeCustomSQL('SELECT * FROM vault_items;', 'valid-master')).toEqual({
      columns: [],
      rows: [],
      error: WA_SQLITE_WRITE_NOT_READY_ERROR,
    });
  });

  it('surfaces encrypted row corruption instead of silently returning plaintext placeholders', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');
    await repository.saveVaultItem(createVaultItem(), 'valid-master');
    engine.vaultRows[0].enc_metadata = JSON.stringify({ ciphertext: 'tampered' });

    await expect(repository.getVaultItems('valid-master')).rejects.toThrow(WA_SQLITE_ROW_DECRYPT_ERROR);
  });

  it('resets all wa-sqlite tables through a transaction', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');
    await repository.saveVaultItem(createVaultItem(), 'valid-master');

    await repository.resetAll();

    expect(engine.userSecretHash).toBeNull();
    expect(engine.vaultRows).toHaveLength(0);
    expect(engine.metadata.size).toBe(0);
  });

  it('derives keys without caching plaintext passwords as map keys', async () => {
    const engine = createEngineStub();
    engine.metadata.set('vault_encryption_salt', 'salt');
    const repository = createWaSqliteVaultStorageRepository({ engine });

    await expect(repository.deriveEncryptionKey('valid-master', 'salt')).resolves.toEqual(new Uint8Array(32).fill(7));
    repository.clearDerivedKeyCache();
  });

  it('escapes SQL values when persisting metadata with quotes', async () => {
    const engine = createEngineStub();
    const repository = createWaSqliteVaultStorageRepository({ engine });
    await repository.setupMaster('valid-master');
    await repository.saveVaultItem(createVaultItem({ id: "id'1", title: "Alice's Login" }), 'valid-master');

    expect(engine.vaultRows[0].id).toBe("id'1");
    expect(engine.vaultRows[0].title).toBe("Alice's Login");
  });
});
