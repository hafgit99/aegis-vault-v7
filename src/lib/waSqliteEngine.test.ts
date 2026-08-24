/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { createWaSqlitePersistenceProfile } from './waSqlitePersistence';
import { bindSqlParams, createWaSqliteEngine, createWaSqliteModuleConfig, WA_SQLITE_BOOTSTRAP_SCHEMA, type WaSqliteRuntime } from './waSqliteEngine';

function createRuntimeStub(): WaSqliteRuntime & {
  exec: ReturnType<typeof vi.fn>;
  open_v2: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  const open_v2 = vi.fn(async () => 42);
  const close = vi.fn(async () => 0);
  const exec = vi.fn(async (_db: number, sql: string, callback?: (row: unknown[], columns: string[]) => void) => {
    if (sql.includes('sqlite_master')) {
      callback?.([3], ['table_count']);
      return 0;
    }

    if (sql.includes('SELECT payload')) {
      callback?.([123n, new Uint8Array([1, 2, 3]), 'ok', null], ['big', 'blob', 'text', 'empty']);
      return 0;
    }

    if (sql.includes('SELECT id, title FROM vault_items')) {
      callback?.(['item-1', 'Example'], ['id', 'title']);
      callback?.(['item-2', 'Second'], ['id', 'title']);
      return 0;
    }

    if (sql.trim().toLowerCase().startsWith('with ')) {
      callback?.(['ready'], ['status']);
      return 0;
    }
    if (sql.includes('BROKEN')) {
      throw new Error('sqlite syntax error');
    }

    return 0;
  });

  return {
    module: {},
    sqlite3: {
      open_v2,
      exec,
      close,
    },
    open_v2,
    exec,
    close,
  };
}

describe('wa-sqlite engine', () => {
  it('creates a Vite-safe module config and preserves explicit WASM overrides', () => {
    const wasmBinary = new Uint8Array([0, 1, 2]);
    const customLocateFile = vi.fn((path: string, prefix?: string) => `${prefix ?? ''}${path}`);

    const defaultConfig = createWaSqliteModuleConfig() as {
      locateFile: (path: string, prefix?: string) => string;
    };
    const overrideConfig = createWaSqliteModuleConfig({
      locateFile: customLocateFile,
      wasmBinary,
    }) as {
      locateFile: (path: string, prefix?: string) => string;
      wasmBinary: Uint8Array;
    };

    expect(defaultConfig.locateFile('wa-sqlite.wasm', '/assets/')).toContain('wa-sqlite.wasm');
    expect(defaultConfig.locateFile('other.data', '/assets/')).toBe('other.data');
    expect(overrideConfig.locateFile('wa-sqlite.wasm', '/assets/')).toBe('/assets/wa-sqlite.wasm');
    expect(overrideConfig.wasmBinary).toBe(wasmBinary);
  });
  it('opens the database lazily and bootstraps the Aegis schema', async () => {
    const runtime = createRuntimeStub();
    const engine = createWaSqliteEngine({
      databaseName: 'aegis-test.db',
      loadRuntime: vi.fn(async () => runtime),
    });

    await expect(engine.initialize()).resolves.toEqual({
      initialized: true,
      databaseName: 'aegis-test.db',
      tableCount: 3,
      persistenceProfile: createWaSqlitePersistenceProfile('browser-fallback', false),
    });

    expect(runtime.open_v2).toHaveBeenCalledWith('aegis-test.db');
    expect(runtime.exec).toHaveBeenNthCalledWith(1, 42, WA_SQLITE_BOOTSTRAP_SCHEMA);
  });

  it('uses the scoped wa-sqlite persistence profile database name by default', async () => {
    const runtime = createRuntimeStub();
    const persistenceProfile = createWaSqlitePersistenceProfile('desktop-app-data', false);
    const engine = createWaSqliteEngine({
      persistenceProfile,
      loadRuntime: vi.fn(async () => runtime),
    });

    await expect(engine.initialize()).resolves.toMatchObject({
      databaseName: '/aegis-wa-sqlite.desktop.db',
      persistenceProfile,
    });
    expect(runtime.open_v2).toHaveBeenCalledWith('/aegis-wa-sqlite.desktop.db');
  });

  it('registers and opens the persistent IndexedDB VFS when the profile is ready', async () => {
    const runtime = createRuntimeStub();
    const closeVfs = vi.fn(async () => undefined);
    const persistenceProfile = createWaSqlitePersistenceProfile('android-app-private', true);
    const engine = createWaSqliteEngine({
      persistenceProfile,
      loadRuntime: vi.fn(async () => runtime),
      registerPersistentVfs: vi.fn(async () => ({
        name: 'aegis-wa-sqlite-android-idb',
        close: closeVfs,
      })),
    });

    await expect(engine.initialize()).resolves.toMatchObject({
      databaseName: '/aegis-wa-sqlite.android.db',
      persistenceProfile,
    });
    expect(runtime.open_v2).toHaveBeenCalledWith(
      '/aegis-wa-sqlite.android.db',
      undefined,
      'aegis-wa-sqlite-android-idb',
    );

    await engine.close();

    expect(runtime.close).toHaveBeenCalledWith(42);
    expect(closeVfs).toHaveBeenCalledOnce();
  });

  it('normalizes BigInt and blob query values into repository-safe rows', async () => {
    const runtime = createRuntimeStub();
    const engine = createWaSqliteEngine({
      loadRuntime: vi.fn(async () => runtime),
    });

    await expect(engine.execute('SELECT payload FROM vault_items;')).resolves.toEqual({
      columns: ['big', 'blob', 'text', 'empty'],
      rows: [['123', [1, 2, 3], 'ok', null]],
    });
  });

  it('returns structured query errors without throwing to callers', async () => {
    const engine = createWaSqliteEngine({
      loadRuntime: vi.fn(async () => createRuntimeStub()),
    });

    await expect(engine.execute('BROKEN SQL')).resolves.toEqual({
      columns: [],
      rows: [],
      error: 'sqlite syntax error',
    });
  });

  it('allows only read-only SELECT/CTE statements through executeReadOnly', async () => {
    const runtime = createRuntimeStub();
    const engine = createWaSqliteEngine({
      loadRuntime: vi.fn(async () => runtime),
    });

    await expect(engine.executeReadOnly('SELECT payload FROM vault_items;')).resolves.toEqual({
      columns: ['big', 'blob', 'text', 'empty'],
      rows: [['123', [1, 2, 3], 'ok', null]],
    });
    await expect(engine.executeReadOnly('WITH status AS (SELECT "ready" AS value) SELECT value FROM status;')).resolves.toEqual({
      columns: ['status'],
      rows: [['ready']],
    });
    await expect(engine.executeReadOnly('UPDATE vault_items SET title = "bad";')).resolves.toEqual({
      columns: [],
      rows: [],
      error: 'wa-sqlite-read-only-query-required',
    });
  });

  it('maps selected rows to objects and throws on blocked statements', async () => {
    const engine = createWaSqliteEngine({
      loadRuntime: vi.fn(async () => createRuntimeStub()),
    });

    await expect(engine.selectObjects('SELECT id, title FROM vault_items;')).resolves.toEqual([
      { id: 'item-1', title: 'Example' },
      { id: 'item-2', title: 'Second' },
    ]);
    await expect(engine.selectObjects('DELETE FROM vault_items;')).rejects.toThrow('wa-sqlite-read-only-query-required');
  });
  it('closes an open database exactly once', async () => {
    const runtime = createRuntimeStub();
    const engine = createWaSqliteEngine({
      loadRuntime: vi.fn(async () => runtime),
    });

    await engine.execute('SELECT payload FROM vault_items;');
    await engine.close();
    await engine.close();

    expect(runtime.close).toHaveBeenCalledOnce();
    expect(runtime.close).toHaveBeenCalledWith(42);
  });

  describe('bindSqlParams parameter binding security', () => {
    it('binds positional parameters cleanly with proper type escaping', () => {
      const sql = 'INSERT INTO test (name, count, active, data, opt) VALUES (?, ?, ?, ?, ?);';
      const bound = bindSqlParams(sql, [
        "Alice's Keys",
        42,
        true,
        new Uint8Array([0xde, 0xad, 0xbe, 0xef]),
        null,
      ]);
      expect(bound).toBe("INSERT INTO test (name, count, active, data, opt) VALUES ('Alice''s Keys', 42, 1, X'deadbeef', NULL);");
    });

    it('binds named parameters cleanly and neutralizes SQL injection attempts', () => {
      const sql = 'SELECT * FROM users WHERE username = :username AND role = :role;';
      const bound = bindSqlParams(sql, {
        username: "admin' OR '1'='1",
        role: 'user',
      });
      expect(bound).toBe("SELECT * FROM users WHERE username = 'admin'' OR ''1''=''1' AND role = 'user';");
    });

    it('throws when missing positional or named parameters', () => {
      expect(() => bindSqlParams('SELECT * FROM a WHERE x = ? AND y = ?;', [1])).toThrow(/Insufficient SQL parameters/);
      expect(() => bindSqlParams('SELECT * FROM a WHERE x = :id;', {})).toThrow(/Missing named SQL parameter: :id/);
    });
  });
});
