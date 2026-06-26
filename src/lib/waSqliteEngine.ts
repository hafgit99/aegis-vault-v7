/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultStorageQueryResult } from './vaultStorageRepository';
import waSqliteWasmUrl from 'wa-sqlite/dist/wa-sqlite.wasm?url';

type WaSqliteCompatibleValue = number | string | Uint8Array | Array<number> | bigint | null;

interface WaSqliteApi {
  open_v2(databaseName: string): Promise<number>;
  exec(
    db: number,
    sql: string,
    callback?: (row: Array<WaSqliteCompatibleValue>, columns: string[]) => void,
  ): Promise<number>;
  close(db: number): Promise<number>;
}

export interface WaSqliteRuntime {
  sqlite3: WaSqliteApi;
  module: unknown;
}

export interface WaSqliteEngineOptions {
  databaseName?: string;
  loadRuntime?: () => Promise<WaSqliteRuntime>;
  locateFile?: (path: string, prefix?: string) => string;
  wasmBinary?: unknown;
}

export interface WaSqliteEngineHealth {
  initialized: boolean;
  databaseName: string;
  tableCount: number;
}

export interface WaSqliteEngine {
  initialize(): Promise<WaSqliteEngineHealth>;
  execute(sql: string): Promise<VaultStorageQueryResult>;
  executeReadOnly(sql: string): Promise<VaultStorageQueryResult>;
  selectObjects(sql: string): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

const DEFAULT_DATABASE_NAME = 'aegis-wa-sqlite.db';

export const WA_SQLITE_BOOTSTRAP_SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS storage_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_secrets (
  username TEXT PRIMARY KEY,
  argon_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS vault_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  favorite INTEGER NOT NULL DEFAULT 0,
  deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  username_db TEXT NOT NULL DEFAULT '[encrypted: aes-256-gcm]',
  password_db TEXT NOT NULL DEFAULT '[encrypted: aes-256-gcm]',
  notes_db TEXT NOT NULL DEFAULT '',
  enc_metadata TEXT NOT NULL,
  enc_kdf TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vault_items_deleted ON vault_items(deleted);
CREATE INDEX IF NOT EXISTS idx_vault_items_category ON vault_items(category);
CREATE INDEX IF NOT EXISTS idx_vault_items_updated_at ON vault_items(updated_at);
INSERT OR REPLACE INTO storage_metadata (key, value)
VALUES ('schema_version', '1');
`;

export function createWaSqliteModuleConfig(
  options: Pick<WaSqliteEngineOptions, 'locateFile' | 'wasmBinary'> = {},
): object {
  return {
    locateFile: options.locateFile ?? ((path: string) => (path.endsWith('.wasm') ? waSqliteWasmUrl : path)),
    ...(options.wasmBinary ? { wasmBinary: options.wasmBinary } : {}),
  };
}

async function loadDefaultWaSqliteRuntime(
  options: Pick<WaSqliteEngineOptions, 'locateFile' | 'wasmBinary'> = {},
): Promise<WaSqliteRuntime> {
  const [{ default: SQLiteESMFactory }, SQLite] = await Promise.all([
    import('wa-sqlite/dist/wa-sqlite.mjs'),
    import('wa-sqlite'),
  ]);
  const module = await SQLiteESMFactory(createWaSqliteModuleConfig(options));
  return {
    sqlite3: SQLite.Factory(module),
    module,
  };
}

function normalizeWaSqliteValue(value: WaSqliteCompatibleValue): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return Array.from(value);
  }

  return value;
}

function isReadOnlySelect(sql: string): boolean {
  const normalizedSql = sql.trim().replace(/^--.*$/gm, '').trim().toLowerCase();
  return normalizedSql.startsWith('select ') || normalizedSql.startsWith('with ');
}

function rowsToObjects(result: VaultStorageQueryResult): Array<Record<string, unknown>> {
  return result.rows.map((row) => Object.fromEntries(
    result.columns.map((column, index) => [column, row[index]]),
  ));
}
export function createWaSqliteEngine(options: WaSqliteEngineOptions = {}): WaSqliteEngine {
  const databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
  const loadRuntime = options.loadRuntime ?? (() => loadDefaultWaSqliteRuntime(options));
  let runtime: WaSqliteRuntime | null = null;
  let db: number | null = null;

  async function ensureOpen(): Promise<{ sqlite3: WaSqliteApi; db: number }> {
    if (!runtime) {
      runtime = await loadRuntime();
    }

    if (db === null) {
      db = await runtime.sqlite3.open_v2(databaseName);
    }

    return {
      sqlite3: runtime.sqlite3,
      db,
    };
  }

  return {
    async initialize(): Promise<WaSqliteEngineHealth> {
      const opened = await ensureOpen();
      await opened.sqlite3.exec(opened.db, WA_SQLITE_BOOTSTRAP_SCHEMA);
      const tableResult = await this.execute(
        "SELECT COUNT(*) AS table_count FROM sqlite_master WHERE type = 'table';",
      );
      const tableCount = Number(tableResult.rows[0]?.[0] ?? 0);

      return {
        initialized: true,
        databaseName,
        tableCount,
      };
    },

    async execute(sql: string): Promise<VaultStorageQueryResult> {
      const opened = await ensureOpen();
      const rows: unknown[][] = [];
      let columns: string[] = [];

      try {
        await opened.sqlite3.exec(opened.db, sql, (row, rowColumns) => {
          columns = rowColumns;
          rows.push(row.map(normalizeWaSqliteValue));
        });
      } catch (error) {
        return {
          columns,
          rows,
          error: error instanceof Error ? error.message : 'wa-sqlite-execute-failed',
        };
      }

      return {
        columns,
        rows,
      };
    },

    async executeReadOnly(sql: string): Promise<VaultStorageQueryResult> {
      if (!isReadOnlySelect(sql)) {
        return {
          columns: [],
          rows: [],
          error: 'wa-sqlite-read-only-query-required',
        };
      }

      return this.execute(sql);
    },

    async selectObjects(sql: string): Promise<Array<Record<string, unknown>>> {
      const result = await this.executeReadOnly(sql);
      if (result.error) {
        throw new Error(result.error);
      }

      return rowsToObjects(result);
    },

    async close(): Promise<void> {
      if (runtime && db !== null) {
        const closingDb = db;
        db = null;
        await runtime.sqlite3.close(closingDb);
      }
    },
  };
}
