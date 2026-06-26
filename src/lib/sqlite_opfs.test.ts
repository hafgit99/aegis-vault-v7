/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import { createEmptyVaultDatabaseState, type VersionedVaultDatabaseState } from './vaultDatabaseFormat';

const writeDesktopVaultDatabase = vi.hoisted(() => vi.fn(async () => false));
const readDesktopVaultDatabase = vi.hoisted(() => vi.fn(async () => null));
const getNativeVaultStorageScope = vi.hoisted(() => vi.fn(() => 'desktop-app-data'));
const originalNavigatorStorage = navigator.storage;

vi.mock('./desktopStorage', () => ({
  getNativeVaultStorageScope,
  readDesktopVaultDatabase,
  resetDesktopVaultDatabase: vi.fn(async () => false),
  writeDesktopVaultDatabase,
}));

vi.mock('./argon2id', () => ({
  createArgon2idHash: vi.fn(async (password: string, salt: string) => `$argon2id$${salt}$${password}`),
  deriveArgon2idKey: vi.fn(async (password: string) => {
    const bytes = new TextEncoder().encode(password.padEnd(32, '#').slice(0, 32));
    return new Uint8Array(bytes);
  }),
  verifyArgon2idHash: vi.fn(async (password: string, encoded: string) => encoded.endsWith(`$${password}`)),
}));

function sampleItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-login-1',
    title: 'Email Account',
    username: 'ada',
    password: 'secret-password',
    url: 'https://example.test',
    notes: 'private note',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    category: 'login',
    favorite: true,
    ...overrides,
  };
}

async function freshSqliteInstance() {
  vi.resetModules();
  const module = await import('./sqlite_opfs');
  await module.sqliteOPFSInstance.hydrate();
  return module.sqliteOPFSInstance;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  getNativeVaultStorageScope.mockReturnValue('desktop-app-data');
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: originalNavigatorStorage,
  });
  vi.restoreAllMocks();
});

describe('SQLite OPFS persistence engine', () => {
  it('sets up a master password, stores encrypted rows, and exposes read-only SQL results', async () => {
    const sqlite = await freshSqliteInstance();
    let notifications = 0;
    const unsubscribe = sqlite.subscribeLogs(() => {
      notifications += 1;
    });

    await sqlite.setupMaster('master-pass');

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    await expect(sqlite.verifyPassword('wrong-pass')).resolves.toBe(false);

    const savedItems = await sqlite.saveVaultItem(sampleItem(), 'master-pass');

    expect(savedItems).toHaveLength(1);
    expect(savedItems[0]).toMatchObject({
      id: 'item-login-1',
      title: 'Email Account',
      username: 'ada',
      password: 'secret-password',
      favorite: true,
      deleted: false,
    });

    const persisted = JSON.parse(localStorage.getItem('aegis_sqlite_fallback') ?? '{}');
    expect(persisted.encryption_salt).toMatch(/^[0-9a-f]{32}$/);
    expect(persisted.vault_items[0]).toMatchObject({
      id: 'item-login-1',
      username_db: '[encrypted: aes-256-gcm]',
      password_db: '[encrypted: aes-256-gcm]',
      notes_db: '[encrypted: aes-256-gcm]',
      enc_kdf: 'argon2-browser',
    });
    expect(persisted.vault_items[0].enc_metadata).not.toContain('secret-password');
    expect(writeDesktopVaultDatabase).toHaveBeenCalled();

    const result = sqlite.executeCustomSQL(
      'SELECT id, title, username FROM vault_items WHERE deleted = 0;',
      'master-pass',
    );

    expect(result).toEqual({
      columns: ['id', 'title', 'username'],
      rows: [['item-login-1', 'Email Account', '[encrypted: aes-256-gcm]']],
    });

    const blockedWrite = sqlite.executeCustomSQL('DELETE FROM vault_items;', 'master-pass');
    expect(blockedWrite.error).toContain('disabled');

    expect(sqlite.getQueryLogs()[0]).toMatchObject({
      query: 'DELETE FROM vault_items;',
      status: 'ERROR',
    });

    unsubscribe();
    sqlite.logQuery('SELECT 1;', 'SUCCESS', 1);
    expect(notifications).toBeGreaterThan(0);
  });

  it('reseeds demo rows, filters deleted SQL rows, deletes permanently, and resets state', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    const reseeded = await sqlite.reseedDemo('master-pass', [
      sampleItem({ id: 'active-item', title: 'Active Item', deleted: false }),
      sampleItem({ id: 'trash-item', title: 'Trash Item', deleted: true, deletedAt: '2026-02-01' }),
    ]);

    expect(reseeded.map((item) => item.id)).toEqual(['active-item', 'trash-item']);

    const trashRows = sqlite.executeCustomSQL('SELECT id, title, deleted FROM vault_items WHERE deleted = 1', 'master-pass');
    expect(trashRows.rows).toEqual([['trash-item', 'Trash Item', 1]]);

    const afterDelete = await sqlite.deletePermanently('trash-item', 'master-pass');
    expect(afterDelete.map((item) => item.id)).toEqual(['active-item']);

    await sqlite.resetAll();

    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([]);
    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(false);
  });

  it('hydrates an existing fallback database from localStorage', async () => {
    const state: VersionedVaultDatabaseState = {
      ...createEmptyVaultDatabaseState(),
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$master-pass' }],
    };

    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify(state));

    const sqlite = await freshSqliteInstance();

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    expect(sqlite.executeCustomSQL('SELECT * FROM user_secrets', 'master-pass')).toMatchObject({
      columns: ['username', 'argon_hash'],
      rows: [['owner', '$argon2id$salt$master-pass']],
    });
  });

  it('hydrates a desktop database payload before local fallback storage', async () => {
    const state: VersionedVaultDatabaseState = {
      ...createEmptyVaultDatabaseState(),
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$master-pass' }],
    };

    readDesktopVaultDatabase.mockResolvedValueOnce(JSON.stringify(state));

    const sqlite = await freshSqliteInstance();

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    expect(JSON.parse(localStorage.getItem('aegis_sqlite_fallback') ?? '{}')).toMatchObject({
      desktopManaged: true,
      user_secrets: [{ username: 'owner', argon_hash: '[stored-in-desktop-app-data]' }],
      vault_items: [],
    });
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: 'sqlite3_open("desktop-app-data:///aegis_sqlite.db")',
          status: 'SUCCESS',
        }),
      ]),
    );
  });

  it('labels Android Tauri database hydration as app-private native storage', async () => {
    const state: VersionedVaultDatabaseState = {
      ...createEmptyVaultDatabaseState(),
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$master-pass' }],
    };

    getNativeVaultStorageScope.mockReturnValueOnce('android-app-private');
    readDesktopVaultDatabase.mockResolvedValueOnce(JSON.stringify(state));

    const sqlite = await freshSqliteInstance();

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: 'sqlite3_open("android-app-private:///aegis_sqlite.db")',
          status: 'SUCCESS',
        }),
      ]),
    );
  });

  it('hydrates an existing OPFS database file and mirrors it back to persistence', async () => {
    const state: VersionedVaultDatabaseState = {
      ...createEmptyVaultDatabaseState(),
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$master-pass' }],
    };
    const writable = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const getFileHandle = vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (options?.create) {
        return { createWritable: vi.fn(async () => writable) };
      }

      return {
        getFile: vi.fn(async () => ({
          text: vi.fn(async () => JSON.stringify(state)),
        })),
      };
    });

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({ getFileHandle })),
      },
    });

    const sqlite = await freshSqliteInstance();

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    expect(getFileHandle).toHaveBeenCalledWith('aegis_sqlite.db');
    expect(getFileHandle).toHaveBeenCalledWith('aegis_sqlite.db', { create: true });
    expect(writable.write).toHaveBeenCalledWith(expect.stringContaining('"user_secrets"'));
    expect(writable.close).toHaveBeenCalled();
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: 'sqlite3_open("opfs:///aegis_sqlite.db")',
          status: 'SUCCESS',
        }),
      ]),
    );
  });

  it('initializes a missing OPFS database file from the local fallback mirror', async () => {
    const state: VersionedVaultDatabaseState = {
      ...createEmptyVaultDatabaseState(),
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$master-pass' }],
    };
    const writable = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    const getFileHandle = vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (!options?.create) {
        throw new Error('missing opfs file');
      }

      return { createWritable: vi.fn(async () => writable) };
    });

    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify(state));
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({ getFileHandle })),
      },
    });

    const sqlite = await freshSqliteInstance();

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    expect(writable.write).toHaveBeenCalledWith(expect.stringContaining('"user_secrets"'));
    expect(writeDesktopVaultDatabase).toHaveBeenCalledWith(expect.stringContaining('"user_secrets"'));
  });

  it('falls back to local mirror when desktop payload loading fails', async () => {
    const state: VersionedVaultDatabaseState = {
      ...createEmptyVaultDatabaseState(),
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$master-pass' }],
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    readDesktopVaultDatabase.mockRejectedValueOnce(new Error('desktop read failed'));
    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify(state));

    const sqlite = await freshSqliteInstance();

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({
      code: 'storage.desktop.readFailed',
      source: 'AegisSecurity',
    }));
  });

  it('logs persistence write failures without breaking vault setup', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const getFileHandle = vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (!options?.create) {
        throw new Error('missing opfs file');
      }

      throw new Error('opfs write failed');
    });

    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: vi.fn(async () => ({ getFileHandle })),
      },
    });

    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    expect(error).toHaveBeenCalledWith(expect.objectContaining({
      code: 'storage.desktop.writeFailed',
      source: 'AegisSecurity',
    }));
  });

  it('migrates legacy localStorage vault data into encrypted SQLite rows', async () => {
    localStorage.setItem('aegis_is_setup', 'true');
    localStorage.setItem('aegis_master_password', btoa('master-pass'));
    localStorage.setItem(
      'aegis_vault_items',
      JSON.stringify([
        sampleItem({
          id: 'legacy-login',
          title: 'Legacy Login',
          notes: '',
          favorite: false,
        }),
      ]),
    );

    const sqlite = await freshSqliteInstance();

    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([
      expect.objectContaining({
        id: 'legacy-login',
        title: 'Legacy Login',
        username: 'ada',
        password: 'secret-password',
        favorite: false,
      }),
    ]);

    const persisted = JSON.parse(localStorage.getItem('aegis_sqlite_fallback') ?? '{}');
    expect(persisted.vault_items[0]).toMatchObject({
      id: 'legacy-login',
      notes_db: '',
      enc_kdf: 'argon2-browser',
    });
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining('CREATE TABLE vault_items'),
          rowsAffected: 1,
        }),
      ]),
    );
  });

  it('migrates existing static-salt vault rows to a persisted per-vault salt', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');
    await sqlite.saveVaultItem(sampleItem({ id: 'static-salt-row' }), 'master-pass');

    const persisted = JSON.parse(localStorage.getItem('aegis_sqlite_fallback') ?? '{}');
    delete persisted.encryption_salt;
    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify(persisted));

    const legacyStaticSaltSqlite = await freshSqliteInstance();

    await expect(legacyStaticSaltSqlite.verifyPassword('master-pass')).resolves.toBe(true);
    await expect(legacyStaticSaltSqlite.getVaultItems('master-pass')).resolves.toEqual([
      expect.objectContaining({ id: 'static-salt-row', password: 'secret-password' }),
    ]);

    const migrated = JSON.parse(localStorage.getItem('aegis_sqlite_fallback') ?? '{}');
    expect(migrated.encryption_salt).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns an error result for unsupported SQL read targets and unknown commands', async () => {
    const sqlite = await freshSqliteInstance();

    const unsupportedTable = sqlite.executeCustomSQL('SELECT * FROM audit_logs', 'master-pass');
    const unknownCommand = sqlite.executeCustomSQL('VACUUM', 'master-pass');

    expect(unsupportedTable).toMatchObject({
      columns: [],
      rows: [],
      error: expect.stringContaining('user_secrets'),
    });
    expect(unknownCommand).toMatchObject({
      columns: [],
      rows: [],
      error: expect.stringContaining('VACUUM'),
    });
    expect(sqlite.getQueryLogs()[0]).toMatchObject({
      query: 'VACUUM',
      status: 'ERROR',
    });
  });

  it('updates existing rows and masks broad SQL vault item projections', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    const created = await sqlite.saveVaultItem(
      sampleItem({
        id: '',
        title: '',
        category: undefined as VaultItem['category'],
        notes: '',
        createdAt: '',
      }),
      'master-pass',
    );

    const generatedId = created[0].id;
    expect(generatedId).toHaveLength(9);
    expect(created[0]).toMatchObject({
      title: 'Imported Record',
      category: 'login',
    });

    const updated = await sqlite.saveVaultItem(
      sampleItem({
        id: generatedId,
        title: 'Updated Login',
        favorite: false,
      }),
      'master-pass',
    );

    expect(updated).toEqual([
      expect.objectContaining({
        id: generatedId,
        title: 'Updated Login',
        favorite: false,
      }),
    ]);

    const allColumns = sqlite.executeCustomSQL('SELECT * FROM vault_items', 'master-pass');
    expect(allColumns.columns).toEqual([
      'id',
      'title',
      'category',
      'favorite',
      'deleted',
      'username_db',
      'password_db',
      'notes_db',
      'enc_metadata',
    ]);
    expect(allColumns.rows[0]).toEqual([
      generatedId,
      'Updated Login',
      'login',
      0,
      0,
      '[encrypted: aes-256-gcm]',
      '[encrypted: aes-256-gcm]',
      '[encrypted: aes-256-gcm]',
      expect.stringMatching(/^[\s\S]{35}$/),
    ]);

    const projected = sqlite.executeCustomSQL(
      'SELECT password, enc_metadata, unknown_column FROM vault_items',
      'master-pass',
    );
    expect(projected).toEqual({
      columns: ['password', 'enc_metadata', 'unknown_column'],
      rows: [[
        '[encrypted: aes-256-gcm]',
        expect.stringMatching(/^[\s\S]{35}$/),
        'NULL',
      ]],
    });
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining('UPDATE vault_items SET title = "Updated Login"'),
          status: 'SUCCESS',
        }),
      ]),
    );
  });

  it('derives vault item keys on demand without requiring a plaintext password cache', async () => {
    const state: VersionedVaultDatabaseState = {
      ...createEmptyVaultDatabaseState(),
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$master-pass' }],
      vault_items: [
        {
          id: 'encrypted-row',
          title: 'Encrypted Row',
          category: 'login',
          favorite: 0,
          deleted: 0,
          deleted_at: null,
          created_at: '2026-01-01',
          updated_at: '2026-01-01',
          username: 'ada',
          username_db: '[encrypted: aes-256-gcm]',
          password_db: '[encrypted: aes-256-gcm]',
          notes_db: '',
          enc_metadata: '{}',
          enc_kdf: 'argon2-browser',
        },
      ],
    };

    localStorage.setItem('aegis_sqlite_fallback', JSON.stringify(state));
    const sqlite = await freshSqliteInstance();

    await expect(sqlite.deriveEncryptionKey('master-pass')).resolves.toBeInstanceOf(Uint8Array);
    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([
      expect.objectContaining({
        id: 'encrypted-row',
        title: 'Encrypted Row',
        username: '[encrypted: aes-256-gcm]',
      }),
    ]);
    expect(sqlite.getQueryLogs()[0]).toMatchObject({
      query: 'SELECT id, title, category, favorite, deleted, username_db, enc_metadata FROM vault_items;',
      status: 'SUCCESS',
    });
  });

  it('stores only a desktop-managed setup marker in localStorage after desktop persistence succeeds', async () => {
    writeDesktopVaultDatabase.mockResolvedValue(true);
    const sqlite = await freshSqliteInstance();

    await sqlite.setupMaster('master-pass');
    await sqlite.saveVaultItem(sampleItem(), 'master-pass');

    const mirror = JSON.parse(localStorage.getItem('aegis_sqlite_fallback') ?? '{}');
    expect(mirror).toMatchObject({
      desktopManaged: true,
      user_secrets: [{ username: 'owner', argon_hash: '[stored-in-desktop-app-data]' }],
      vault_items: [],
    });
    expect(JSON.stringify(mirror)).not.toContain('secret-password');
    expect(JSON.stringify(mirror)).not.toContain('enc_metadata');
  });

  it('sanitizes user-controlled values before writing SQL activity logs', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    await sqlite.saveVaultItem(sampleItem({
      id: 'evil"\nrow',
      title: 'Bad <script>alert(1)</script> " Title',
    }), 'master-pass');

    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.not.stringContaining('<script>'),
          status: 'SUCCESS',
        }),
      ]),
    );
  });

  it('blocks direct SQLite master password rotation when the current password is invalid', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');
    await sqlite.saveVaultItem(sampleItem({ id: 'protected-row' }), 'master-pass');
    const before = localStorage.getItem('aegis_sqlite_fallback');
    writeDesktopVaultDatabase.mockClear();

    await expect(sqlite.changeMasterPassword('wrong-pass', 'new-master-pass')).rejects.toThrow(
      'current-master-password-invalid',
    );

    expect(localStorage.getItem('aegis_sqlite_fallback')).toBe(before);
    expect(writeDesktopVaultDatabase).not.toHaveBeenCalled();
    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    await expect(sqlite.verifyPassword('new-master-pass')).resolves.toBe(false);
    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([
      expect.objectContaining({ id: 'protected-row', password: 'secret-password' }),
    ]);
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining('rekey blocked: invalid current password'),
          status: 'ERROR',
          rowsAffected: 0,
        }),
      ]),
    );
  });

  it('rolls back master password rotation when persistence cannot be written', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');
    await sqlite.saveVaultItem(sampleItem({ id: 'rollback-row', title: 'Rollback Row' }), 'master-pass');
    const before = localStorage.getItem('aegis_sqlite_fallback');
    writeDesktopVaultDatabase.mockClear();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    await expect(sqlite.changeMasterPassword('master-pass', 'new-master-pass')).rejects.toThrow(
      'master-password-rotation-persist-failed',
    );

    setItemSpy.mockRestore();
    expect(localStorage.getItem('aegis_sqlite_fallback')).toBe(before);
    await expect(sqlite.verifyPassword('master-pass')).resolves.toBe(true);
    await expect(sqlite.verifyPassword('new-master-pass')).resolves.toBe(false);
    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([
      expect.objectContaining({
        id: 'rollback-row',
        title: 'Rollback Row',
        password: 'secret-password',
      }),
    ]);
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining('rekey rolled back'),
          status: 'ERROR',
          rowsAffected: 0,
        }),
      ]),
    );
  });

  it('rolls back a single vault item save when persistence cannot be written', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');
    const before = localStorage.getItem('aegis_sqlite_fallback');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    await expect(sqlite.saveVaultItem(sampleItem({ id: 'lost-row' }), 'master-pass')).rejects.toThrow(
      'vault-item-persist-failed',
    );

    setItemSpy.mockRestore();
    expect(localStorage.getItem('aegis_sqlite_fallback')).toBe(before);
    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([]);
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining('rolled back because persistence failed'),
          status: 'ERROR',
          rowsAffected: 0,
        }),
      ]),
    );
  });

  it('rolls back bulk vault item saves when persistence cannot be written', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');
    await sqlite.saveVaultItem(sampleItem({ id: 'existing-row', title: 'Existing Row' }), 'master-pass');
    const before = localStorage.getItem('aegis_sqlite_fallback');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    await expect(sqlite.saveVaultItems([
      sampleItem({ id: 'existing-row', title: 'Updated Row' }),
      sampleItem({ id: 'new-bulk-row', title: 'New Bulk Row' }),
    ], 'master-pass')).rejects.toThrow('vault-items-persist-failed');

    setItemSpy.mockRestore();
    expect(localStorage.getItem('aegis_sqlite_fallback')).toBe(before);
    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([
      expect.objectContaining({
        id: 'existing-row',
        title: 'Existing Row',
        password: 'secret-password',
      }),
    ]);
    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining('2 records) rolled back'),
          status: 'ERROR',
          rowsAffected: 0,
        }),
      ]),
    );
  });
  it('performs bulk saves securely in a single sweep using saveVaultItems', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    const bulkItems = [
      sampleItem({ id: 'bulk-1', title: 'Bulk Item 1' }),
      sampleItem({ id: 'bulk-2', title: 'Bulk Item 2' }),
    ];

    const saved = await sqlite.saveVaultItems(bulkItems, 'master-pass');
    expect(saved).toHaveLength(2);
    expect(saved.map(x => x.id)).toEqual(['bulk-1', 'bulk-2']);

    expect(sqlite.getQueryLogs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          query: expect.stringContaining('INSERT OR REPLACE INTO vault_items (2 records)'),
          status: 'SUCCESS',
        }),
      ]),
    );
  });

  it('returns generated ids and normalized fields from bulk saves without a decrypt sweep', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    const saved = await sqlite.saveVaultItems([
      sampleItem({ id: '', title: '', category: undefined as VaultItem['category'], createdAt: '' }),
    ], 'master-pass');

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      title: 'Imported Record',
      category: 'login',
      username: 'ada',
      password: 'secret-password',
      favorite: true,
      deleted: false,
    });
    expect(saved[0].id).toHaveLength(9);
    expect(saved[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(saved[0].updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await expect(sqlite.getVaultItems('master-pass')).resolves.toEqual([
      expect.objectContaining({
        id: saved[0].id,
        title: 'Imported Record',
        password: 'secret-password',
      }),
    ]);
  });

  it('uses the cached KDF derived key when password and salt match, avoiding Argon2id calls', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    const { deriveArgon2idKey } = await import('./argon2id');
    const mockedDerive = vi.mocked(deriveArgon2idKey);
    mockedDerive.mockClear();

    // Call saveVaultItem twice
    await sqlite.saveVaultItem(sampleItem({ id: 'cache-1' }), 'master-pass');
    await sqlite.saveVaultItem(sampleItem({ id: 'cache-2' }), 'master-pass');

    // It should only run deriveArgon2idKey once because the second call hits the cache!
    expect(mockedDerive).toHaveBeenCalledTimes(1);

    // After wiping cache/session, it should run again
    sqlite.clearDerivedKeyCache();
    await sqlite.saveVaultItem(sampleItem({ id: 'cache-3' }), 'master-pass');
    expect(mockedDerive).toHaveBeenCalledTimes(2);
  });

  it('caches legacy encryption key and decrypted vault items to prevent redundant decryption/KDF steps', async () => {
    const sqlite = await freshSqliteInstance();
    await sqlite.setupMaster('master-pass');

    // Add items
    const item = sampleItem({ id: 'cache-perf-1' });
    await sqlite.saveVaultItem(item, 'master-pass');

    // Retrieve items - first time decrypts and caches them
    const items1 = await sqlite.getVaultItems('master-pass');
    expect(items1).toHaveLength(1);
    
    // Internal cache should contain the item
    const cacheMap = (sqlite as any).decryptedItemsCache as Map<string, any>;
    expect(cacheMap.has('cache-perf-1')).toBe(true);
    expect(cacheMap.get('cache-perf-1')?.item.title).toBe(item.title);

    // Legacy KDF key should be cached
    const legacyKey = (sqlite as any).cachedLegacyKeyBytes;
    expect(legacyKey).toBeInstanceOf(Uint8Array);

    // Retrieve items again - should hit the cache
    const items2 = await sqlite.getVaultItems('master-pass');
    expect(items2).toHaveLength(1);
    expect(items2[0].id).toBe('cache-perf-1');

    // clearDerivedKeyCache should wipe both caches
    sqlite.clearDerivedKeyCache();
    expect((sqlite as any).cachedLegacyKeyBytes).toBeNull();
    expect(cacheMap.size).toBe(0);
  });
});
