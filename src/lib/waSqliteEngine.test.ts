/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { createWaSqliteEngine, WA_SQLITE_BOOTSTRAP_SCHEMA, type WaSqliteRuntime } from './waSqliteEngine';

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
    });

    expect(runtime.open_v2).toHaveBeenCalledWith('aegis-test.db');
    expect(runtime.exec).toHaveBeenNthCalledWith(1, 42, WA_SQLITE_BOOTSTRAP_SCHEMA);
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
});
