/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import { createEmptyVaultDatabaseState, type VersionedVaultDatabaseState } from './vaultDatabaseFormat';

const writeDesktopVaultDatabase = vi.hoisted(() => vi.fn(async () => false));
const readDesktopVaultDatabase = vi.hoisted(() => vi.fn(async () => null));

vi.mock('./desktopStorage', () => ({
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
});

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
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
    expect(blockedWrite.error).toContain('devre');

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

    sqlite.resetAll();

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
});
