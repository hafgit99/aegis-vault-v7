/**
 * @vitest-environment jsdom
 */

/**
 * Unit coverage for the extracted SQLite OPFS storage layers:
 * shared helpers, persistence primitives, legacy migration and the
 * row decryption engine.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VaultItem } from '../types';
import {
  areByteArraysEqual,
  buildVaultItemRow,
  createVaultEncryptionSalt,
  bytesToHex,
  ENCRYPTED_MARKER,
  LEGACY_VAULT_ITEM_KDF_PARAMS,
  LEGACY_VAULT_ITEM_KDF_SALT,
  NEW_VAULT_ITEM_KDF_PARAMS,
  sanitizeLogValue,
  sanitizeQueryForLog,
  VAULT_ITEM_KDF,
} from './sqliteOpfsShared';
import {
  consumeVaultRollbackDetected,
  createDesktopManagedSetupMarker,
  DB_FILENAME,
  loadPersistedVaultDatabase,
  LOCAL_FALLBACK_KEY,
  persistVaultDatabase,
  setLastObservedVersionCounter,
  writeLocalFallbackMirror,
} from './sqliteOpfsPersistence';
import {
  migrateLegacyLocalStorage,
  purgeStaleLegacyLocalStorageKeys,
} from './sqliteOpfsMigration';
import { decryptVaultRows } from './sqliteOpfsRowDecryptor';
import { createEmptyVaultDatabaseState, type VaultDatabaseRow } from './vaultDatabaseFormat';
import { derivePerItemKey, generateSafeIv, webCryptoAesGcmEncrypt } from './webcrypto';

const writeDesktopVaultDatabase = vi.hoisted(() => vi.fn(async () => false));
const readDesktopVaultDatabase = vi.hoisted(() => vi.fn(async (): Promise<string | null> => null));
const getNativeVaultStorageScope = vi.hoisted(() => vi.fn(() => 'desktop-app-data'));

vi.mock('./desktopStorage', () => ({
  getNativeVaultStorageScope,
  readDesktopVaultDatabase,
  resetDesktopVaultDatabase: vi.fn(async () => false),
  writeDesktopVaultDatabase,
}));

vi.mock('./indexedDbStorage', () => ({
  getIndexedDbItemSync: vi.fn((key: string) => localStorage.getItem(key)),
  setIndexedDbItemSync: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
  removeIndexedDbItemSync: vi.fn((key: string) => localStorage.removeItem(key)),
}));

vi.mock('./securityEvents', () => ({
  logSecurityEvent: vi.fn(),
  securityEventCodes: {
    storageDesktopReadFailed: 'storage.desktop.readFailed',
    storageDesktopWriteFailed: 'storage.desktop.writeFailed',
    storageLocalFallbackUsed: 'storage.localFallback.used',
    storageLegacyDataPurged: 'storage.legacy.purged',
    storageLegacyMigrationFailed: 'storage.legacy.migrationFailed',
    securityLegacyCryptoWarning: 'security.legacyCryptoWarning',
  },
}));

vi.mock('./argon2id', () => ({
  createArgon2idHash: vi.fn(async (password: string, salt: string) => `$argon2id$${salt}$${password}`),
  deriveArgon2idKey: vi.fn(async (password: string) => new Uint8Array(new TextEncoder().encode(password.padEnd(32, '#').slice(0, 32)))),
  enforceMinimumKdfFloor: vi.fn((opts: Record<string, unknown>) => ({ memoryKiB: 32768, iterations: 3, parallelism: 1, hashLength: 32, ...opts })),
  getDefaultKdfProfile: vi.fn(() => ({ memoryKiB: 65536, iterations: 4, parallelism: 1, hashLength: 32 })),
  isArgon2WriteBlocked: vi.fn(() => false),
}));

import { logSecurityEvent, securityEventCodes } from './securityEvents';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  getNativeVaultStorageScope.mockReturnValue('desktop-app-data');
});

afterEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: undefined,
  });
});

function sampleItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Email Account',
    username: 'ada',
    password: 'secret-password',
    url: 'https://example.test',
    notes: 'private note',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    category: 'login',
    favorite: true,
    deleted: false,
    ...overrides,
  };
}

describe('sqliteOpfsShared helpers', () => {
  it('pins the crypto constants', () => {
    expect(ENCRYPTED_MARKER).toBe('[encrypted: aes-256-gcm]');
    expect(VAULT_ITEM_KDF).toBe('argon2-browser');
    expect(LEGACY_VAULT_ITEM_KDF_SALT).toBe('aegis_vault_v7_db_encryption_salt');
    expect(LEGACY_VAULT_ITEM_KDF_PARAMS).toEqual({ memoryKiB: 32768, iterations: 3, parallelism: 1, hashLength: 32 });
    expect(NEW_VAULT_ITEM_KDF_PARAMS.memoryKiB).toBeGreaterThan(LEGACY_VAULT_ITEM_KDF_PARAMS.memoryKiB);
  });

  it('renders bytes as contiguous lowercase hex', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x0f, 0xa0, 0xff]))).toBe('000fa0ff');
  });

  it('generates unique 32-character hex salts', () => {
    const salt1 = createVaultEncryptionSalt();
    const salt2 = createVaultEncryptionSalt();
    expect(salt1).toMatch(/^[0-9a-f]{32}$/);
    expect(salt2).toMatch(/^[0-9a-f]{32}$/);
    expect(salt1).not.toBe(salt2);
  });

  it('compares byte arrays in constant-time fashion', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    const short = new Uint8Array([1, 2]);

    expect(areByteArraysEqual(a, b)).toBe(true);
    expect(areByteArraysEqual(a, c)).toBe(false);
    expect(areByteArraysEqual(a, short)).toBe(false);
    expect(areByteArraysEqual(null, null)).toBe(true);
    expect(areByteArraysEqual(a, null)).toBe(false);
    expect(areByteArraysEqual(null, a)).toBe(false);
  });

  it('sanitises log values: control chars become spaces, specials become underscores, output capped at 120', () => {
    expect(sanitizeLogValue('a\r\nb\tc"d\\e<f>g')).toBe('a  b c_d_e_f_g');
    expect(sanitizeLogValue('"\\<>')).toBe('____');
    const long = 'x'.repeat(200);
    expect(sanitizeLogValue(long)).toHaveLength(120);
    expect(sanitizeLogValue('plain value')).toBe('plain value');
  });

  it('sanitises SQL queries for logging and neutralises opening script tags', () => {
    expect(sanitizeQueryForLog('SELECT * FROM t;\r\n<script>alert(1)</script>'))
      .toBe('SELECT * FROM t;  &lt;script>alert(1)</script>');
    const long = 'q'.repeat(1500);
    expect(sanitizeQueryForLog(long)).toHaveLength(1000);
  });

  it('builds fully masked vault rows', () => {
    const item = sampleItem();
    const encrypted = { iv: 'aa', data: 'bb' };
    const row = buildVaultItemRow({
      id: item.id,
      encrypted: encrypted as never,
      item,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
    });

    expect(row).toEqual({
      id: 'item-1',
      title: ENCRYPTED_MARKER,
      category: 'login',
      favorite: 1,
      deleted: 0,
      deleted_at: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      username: ENCRYPTED_MARKER,
      username_db: ENCRYPTED_MARKER,
      password_db: ENCRYPTED_MARKER,
      notes_db: ENCRYPTED_MARKER,
      enc_metadata: JSON.stringify(encrypted),
      enc_kdf: VAULT_ITEM_KDF,
    });
  });

  it('applies row defaults: category fallback, flags off, exposed username, empty notes', () => {
    const item = sampleItem({
      category: undefined as never,
      favorite: false,
      deleted: true,
      deletedAt: '2026-02-03',
      notes: '',
      username: 'visible-user',
    });
    const row = buildVaultItemRow({
      id: item.id,
      encrypted: { iv: 'aa', data: 'bb' } as never,
      item,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-02',
      exposeUsername: true,
    });

    expect(row.category).toBe('login');
    expect(row.favorite).toBe(0);
    expect(row.deleted).toBe(1);
    expect(row.deleted_at).toBe('2026-02-03');
    expect(row.username).toBe('visible-user');
    expect(row.notes_db).toBe('');
  });
});

describe('createDesktopManagedSetupMarker / writeLocalFallbackMirror', () => {
  it('marks the state as desktop-managed with masked hashes', () => {
    const state = createEmptyVaultDatabaseState();
    state.schemaVersion = 7;
    state.appId = 'aegis-test';
    state.user_secrets = [{ username: 'owner', argon_hash: '$argon2id$realsecret' }];

    const marker = JSON.parse(createDesktopManagedSetupMarker(state));
    expect(marker).toEqual({
      schemaVersion: 7,
      appId: 'aegis-test',
      desktopManaged: true,
      user_secrets: [{ username: 'owner', argon_hash: '[stored-in-desktop-app-data]' }],
      vault_items: [],
    });
  });

  it('emits an empty secrets list when the vault has no owner yet', () => {
    const marker = JSON.parse(createDesktopManagedSetupMarker(createEmptyVaultDatabaseState()));
    expect(marker.user_secrets).toEqual([]);
  });

  it('mirrors the raw payload when desktop save failed and the marker otherwise', () => {
    const state = createEmptyVaultDatabaseState();

    writeLocalFallbackMirror(state, '{"raw":true}', false);
    expect(localStorage.getItem(LOCAL_FALLBACK_KEY)).toBe('{"raw":true}');

    writeLocalFallbackMirror(state, '{"raw":true}', true);
    const stored = JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY)!);
    expect(stored.desktopManaged).toBe(true);
  });
});

describe('loadPersistedVaultDatabase', () => {
  it('prefers the desktop payload and writes a desktop-managed marker', async () => {
    const state = createEmptyVaultDatabaseState();
    state.user_secrets = [{ username: 'owner', argon_hash: 'h' }];
    readDesktopVaultDatabase.mockResolvedValueOnce(JSON.stringify(state));

    const result = await loadPersistedVaultDatabase();

    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.resaveAfterLoad).toBe(false);
      expect(result.logLabel).toContain('desktop-app-data:///');
      expect(result.state.user_secrets[0]!.username).toBe('owner');
    }
    const mirror = JSON.parse(localStorage.getItem(LOCAL_FALLBACK_KEY)!);
    expect(mirror.desktopManaged).toBe(true);
  });

  it('reports unavailability when desktop storage rejects', async () => {
    readDesktopVaultDatabase.mockRejectedValueOnce(new Error('ipc down'));

    const result = await loadPersistedVaultDatabase();

    expect(result.kind).toBe('unavailable');
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageDesktopReadFailed,
      expect.any(String),
      'warning',
      expect.objectContaining({ error: 'ipc down' }),
    );
  });

  it('reads the OPFS mirror file when desktop storage is empty', async () => {
    const state = createEmptyVaultDatabaseState();
    const getFileHandle = vi.fn(async (_name: string, _options?: { create?: boolean }) => ({
      getFile: async () => ({ text: async () => JSON.stringify(state) }),
    }));
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: async () => ({ getFileHandle }) },
    });

    const result = await loadPersistedVaultDatabase();

    expect(getFileHandle).toHaveBeenCalledWith(DB_FILENAME);
    expect(result.kind).toBe('state');
    if (result.kind === 'state') {
      expect(result.resaveAfterLoad).toBe(true);
      expect(result.logLabel).toBe(`sqlite3_open("opfs:///${DB_FILENAME}")`);
    }
  });

  it('signals a missing OPFS file without migrating anything itself', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: async () => ({
          getFileHandle: async () => {
            throw new Error('NotFound');
          },
        }),
      },
    });

    const result = await loadPersistedVaultDatabase();
    expect(result.kind).toBe('missing');
  });

  it('signals an empty OPFS file', async () => {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {
        getDirectory: async () => ({
          getFileHandle: async () => ({ getFile: async () => ({ text: async () => '' }) }),
        }),
      },
    });

    const result = await loadPersistedVaultDatabase();
    expect(result.kind).toBe('empty');
  });

  it('signals unavailability when neither desktop nor OPFS exist', async () => {
    const result = await loadPersistedVaultDatabase();
    expect(result.kind).toBe('unavailable');
  });
});

describe('persistVaultDatabase', () => {
  it('writes the desktop database first and reports success', async () => {
    writeDesktopVaultDatabase.mockResolvedValueOnce(false);
    const state = createEmptyVaultDatabaseState();

    await expect(persistVaultDatabase(state)).resolves.toBe(true);
    expect(writeDesktopVaultDatabase).toHaveBeenCalledWith(JSON.stringify(state));
  });

  it('logs a critical event and returns false when writing fails', async () => {
    writeDesktopVaultDatabase.mockRejectedValueOnce(new Error('disk full'));

    await expect(persistVaultDatabase(createEmptyVaultDatabaseState())).resolves.toBe(false);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageDesktopWriteFailed,
      expect.any(String),
      'critical',
      expect.objectContaining({ error: 'disk full' }),
    );
  });
});

describe('loadPersistedVaultDatabase', () => {
  it('detects rollback when loaded state versionCounter is lower than previous observed (R-1)', async () => {
    setLastObservedVersionCounter(5);
    const rolledBackState = {
      ...createEmptyVaultDatabaseState(),
      versionCounter: 2,
    };
    readDesktopVaultDatabase.mockResolvedValueOnce(JSON.stringify(rolledBackState));

    const result = await loadPersistedVaultDatabase();
    expect(result.kind).toBe('state');
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageLegacyMigrationFailed,
      expect.stringContaining('Vault database rollback detected'),
      'critical',
      expect.objectContaining({ loadedVersion: 2, expectedMinVersion: 5 }),
    );
    // N-1: the detection is surfaced to the UI alert hook exactly once.
    expect(consumeVaultRollbackDetected()).toBe(true);
    expect(consumeVaultRollbackDetected()).toBe(false);
  });

  it('does not flag rollback when the loaded state moves the counter forward', async () => {
    setLastObservedVersionCounter(3);
    const newerState = {
      ...createEmptyVaultDatabaseState(),
      versionCounter: 7,
    };
    readDesktopVaultDatabase.mockResolvedValueOnce(JSON.stringify(newerState));

    await loadPersistedVaultDatabase();
    expect(consumeVaultRollbackDetected()).toBe(false);
  });
});

describe('migrateLegacyLocalStorage', () => {
  const deps = () => ({
    deriveEncryptionKey: vi.fn(async (password: string) =>
      new Uint8Array(new TextEncoder().encode(password.padEnd(32, '#').slice(0, 32)))),
    logQuery: vi.fn(),
  });

  it('restores the previous SQLite state from a plain fallback mirror', async () => {
    const mirrored = createEmptyVaultDatabaseState();
    mirrored.user_secrets = [{ username: 'owner', argon_hash: 'mirror-hash' }];
    localStorage.setItem(LOCAL_FALLBACK_KEY, JSON.stringify(mirrored));

    const result = await migrateLegacyLocalStorage(createEmptyVaultDatabaseState(), deps());

    expect(result.user_secrets[0]!.argon_hash).toBe('mirror-hash');
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageLocalFallbackUsed,
      'Loaded vault state from local fallback mirror.',
      'warning',
    );
  });

  it('ignores empty or broken fallback mirrors without events', async () => {
    localStorage.setItem(LOCAL_FALLBACK_KEY, '{broken');
    await migrateLegacyLocalStorage(createEmptyVaultDatabaseState(), deps());
    expect(logSecurityEvent).not.toHaveBeenCalledWith(
      securityEventCodes.storageLocalFallbackUsed,
      expect.anything(),
      expect.anything(),
    );
  });

  it('ignores a desktop-managed mirror and starts from the current state', async () => {
    localStorage.setItem(LOCAL_FALLBACK_KEY, createDesktopManagedSetupMarker(createEmptyVaultDatabaseState()));
    const current = createEmptyVaultDatabaseState();
    current.user_secrets = [{ username: 'owner', argon_hash: 'live-hash' }];

    const result = await migrateLegacyLocalStorage(current, deps());
    // Normalisation returns a fresh object with identical content.
    expect(result).not.toBe(current);
    expect(result.user_secrets).toEqual([{ username: 'owner', argon_hash: 'live-hash' }]);
    expect(result.vault_items).toEqual([]);
  });

  it('migrates plaintext legacy localStorage items and purges the keys afterwards', async () => {
    localStorage.setItem('aegis_is_setup', 'true');
    localStorage.setItem('aegis_master_password', btoa('legacy-pass'));
    localStorage.setItem(
      'aegis_vault_items',
      JSON.stringify([sampleItem(), sampleItem({ id: 'item-2', favorite: false })]),
    );
    const migrationDeps = deps();

    const result = await migrateLegacyLocalStorage(createEmptyVaultDatabaseState(), migrationDeps);

    expect(result.user_secrets).toHaveLength(1);
    expect(result.user_secrets[0]!.argon_hash).toMatch(/^\$argon2id\$/);
    expect(result.vault_items).toHaveLength(2);
    expect(result.encryption_salt).toMatch(/^[0-9a-f]{32}$/);
    // Rows must be masked, not carrying plaintext metadata.
    expect(result.vault_items[0]!.title).toBe(ENCRYPTED_MARKER);
    expect(migrationDeps.logQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE vault_items'), 'SUCCESS', 2);
    // Security fix Y3: plaintext sources are gone after success.
    expect(localStorage.getItem('aegis_master_password')).toBeNull();
    expect(localStorage.getItem('aegis_vault_items')).toBeNull();
    expect(localStorage.getItem('aegis_is_setup')).toBeNull();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageLegacyDataPurged,
      'Legacy plaintext localStorage keys purged after successful migration.',
      'info',
    );
  });

  it('requires all three legacy seeding flags before attempting a migration', async () => {
    localStorage.setItem('aegis_is_setup', 'true');
    localStorage.setItem('aegis_master_password', btoa('pass'));
    // aegis_vault_items is missing → migration must NOT run.
    const populated = createEmptyVaultDatabaseState();
    populated.user_secrets = [{ username: 'owner', argon_hash: 'existing' }];
    const migrationDeps = deps();

    await migrateLegacyLocalStorage(populated, migrationDeps);

    expect(migrationDeps.logQuery).not.toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE vault_items'),
      expect.anything(),
      expect.anything(),
    );
    // Instead the stale-purge cleanup handles the leftovers.
    expect(localStorage.getItem('aegis_master_password')).toBeNull();
  });

  it('keeps the exact failure message when the migration fails (rollback safety)', async () => {
    localStorage.setItem('aegis_is_setup', 'true');
    localStorage.setItem('aegis_master_password', btoa('legacy-pass'));
    localStorage.setItem('aegis_vault_items', '{broken json');

    const result = await migrateLegacyLocalStorage(createEmptyVaultDatabaseState(), deps());

    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageLegacyMigrationFailed,
      'Legacy localStorage vault migration failed.',
      'critical',
      expect.objectContaining({ error: expect.any(String) }),
    );
    // Rollback safety: plaintext sources survive a failed migration.
    expect(localStorage.getItem('aegis_master_password')).not.toBeNull();
    expect(localStorage.getItem('aegis_vault_items')).not.toBeNull();
    // Pre-existing quirk: the verification hash is written before the
    // item parse fails, so the partial hash survives the rollback.
    expect(result.user_secrets).toHaveLength(1);
    expect(result.vault_items).toEqual([]);
  });

  it('purges stale plaintext keys only when the SQLite store is already populated', () => {
    localStorage.setItem('aegis_master_password', btoa('old'));
    localStorage.setItem('aegis_vault_items', '[]');

    const empty = createEmptyVaultDatabaseState();
    purgeStaleLegacyLocalStorageKeys(empty);
    expect(localStorage.getItem('aegis_master_password')).not.toBeNull();

    const populated = createEmptyVaultDatabaseState();
    populated.vault_items = [
      buildVaultItemRow({
        id: 'row-1',
        encrypted: { iv: 'aa', data: 'bb' } as never,
        item: sampleItem(),
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
      }),
    ];
    purgeStaleLegacyLocalStorageKeys(populated);
    expect(localStorage.getItem('aegis_master_password')).toBeNull();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageLegacyDataPurged,
      'Stale legacy plaintext localStorage keys purged (post-migration cleanup).',
      'info',
    );
  });

  it('purges when only the items key remains and the store is populated', () => {
    localStorage.setItem('aegis_vault_items', '[]');
    const populated = createEmptyVaultDatabaseState();
    populated.vault_items = [
      buildVaultItemRow({
        id: 'row-9',
        encrypted: { iv: 'aa', data: 'bb' } as never,
        item: sampleItem(),
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
      }),
    ];

    purgeStaleLegacyLocalStorageKeys(populated);
    expect(localStorage.getItem('aegis_vault_items')).toBeNull();
  });

  it('purges when only user_secrets are populated even without rows', () => {
    localStorage.setItem('aegis_master_password', btoa('old'));
    const populated = createEmptyVaultDatabaseState();
    populated.user_secrets = [{ username: 'owner', argon_hash: 'h' }];

    purgeStaleLegacyLocalStorageKeys(populated);
    expect(localStorage.getItem('aegis_master_password')).toBeNull();
  });
});

describe('decryptVaultRows', () => {
  const derivedKey = new Uint8Array(32).fill(7);

  async function buildEncryptedRow(item: VaultItem, key: Uint8Array = derivedKey): Promise<VaultDatabaseRow> {
    const itemKey = await derivePerItemKey(key, item.id);
    const encrypted = await webCryptoAesGcmEncrypt(JSON.stringify(item), itemKey, generateSafeIv());
    return {
      ...buildVaultItemRow({
        id: item.id,
        encrypted,
        item,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }),
    };
  }

  it('decrypts rows under their per-item keys and fills the cache', async () => {
    const item = sampleItem();
    const row = await buildEncryptedRow(item);
    const cache = new Map<string, { enc_metadata: string; item: VaultItem }>();

    const { results, migratedLegacyRows } = await decryptVaultRows({ rows: [row], cache, derivedKey });

    expect(migratedLegacyRows).toBe(false);
    expect(results[0]!.item.title).toBe('Email Account');
    expect(cache.get(row.id)?.item.title).toBe('Email Account');
  });

  it('serves cached entries without touching ciphertext', async () => {
    const item = sampleItem();
    const row = await buildEncryptedRow(item);
    const cache = new Map<string, { enc_metadata: string; item: VaultItem }>();
    cache.set(row.id, { enc_metadata: row.enc_metadata, item });

    const { results } = await decryptVaultRows({
      rows: [{ ...row, enc_metadata: 'corrupted-but-cached' }, row],
      cache,
      derivedKey,
    });

    // First row: cache hit on matching enc_metadata would fail here because we
    // changed enc_metadata; second row hits the fast path.
    expect(results[1]!.item.title).toBe('Email Account');

    const direct = await decryptVaultRows({ rows: [row], cache, derivedKey });
    expect(direct.results[0]!.item).toBe(item);
    expect(direct.migratedLegacyRows).toBe(false);
  });

  it('upgrades pre-HKDF rows exactly once via the raw-master-key fallback', async () => {
    const item = sampleItem({ id: 'legacy-row' });
    const rawEncrypted = await webCryptoAesGcmEncrypt(JSON.stringify(item), derivedKey, generateSafeIv());
    const row = await buildVaultItemRow({
      id: item.id,
      encrypted: rawEncrypted,
      item,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }) as VaultDatabaseRow;
    const cache = new Map<string, { enc_metadata: string; item: VaultItem }>();

    const first = await decryptVaultRows({ rows: [row], cache, derivedKey });

    expect(first.migratedLegacyRows).toBe(true);
    expect(first.results[0]!.item.title).toBe('Email Account');
    expect(row.enc_kdf).toBe(VAULT_ITEM_KDF);
    expect(row.enc_metadata).not.toBe(JSON.stringify(rawEncrypted));
    expect(cache.get(row.id)?.item.title).toBe('Email Account');
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.securityLegacyCryptoWarning,
      `Vault item ${row.id} decrypted via legacy master-key fallback and re-encrypted with a per-item key.`,
      'warning',
      { itemId: row.id },
    );

    // Second pass: no more fallback needed — the upgrade persisted.
    const upgradedMetadata = row.enc_metadata;
    const second = await decryptVaultRows({ rows: [row], cache, derivedKey });
    expect(second.migratedLegacyRows).toBe(false);
    expect(second.results[0]!.item.title).toBe('Email Account');
    expect(row.enc_metadata).toBe(upgradedMetadata);
  });

  it('rejects custom-crypto legacy rows with a placeholder fallback item', async () => {
    const row = {
      ...buildVaultItemRow({
        id: 'ancient-row',
        encrypted: { iv: 'aa', data: 'bb' } as never,
        item: sampleItem({ id: 'ancient-row', favorite: false, deleted: true }),
        createdAt: '2025-05-05',
        updatedAt: '2025-05-06',
      }),
      enc_kdf: 'argon2-ancient',
    } as unknown as VaultDatabaseRow;

    const { results, migratedLegacyRows } = await decryptVaultRows({
      rows: [row],
      cache: new Map(),
      derivedKey,
    });

    expect(migratedLegacyRows).toBe(false);
    expect(results[0]!.item).toMatchObject({
      id: 'ancient-row',
      title: ENCRYPTED_MARKER,
      username: ENCRYPTED_MARKER,
      favorite: false,
      deleted: true,
      category: 'login',
    });
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.securityLegacyCryptoWarning,
      'Legacy custom-crypto SQLite rows are no longer decrypted in this build. Re-export from an earlier migration build first.',
      'critical',
    );
  });

  it('falls back to a placeholder item when decryption fails and maps row flags back', async () => {
    const row = {
      ...buildVaultItemRow({
        id: 'broken-row',
        encrypted: { iv: 'aa', data: 'not-a-valid-payload' } as never,
        item: sampleItem({ id: 'broken-row', favorite: false, deleted: true, category: 'card' }),
        createdAt: '2025-06-01',
        updatedAt: '2025-06-02',
      }),
    } as VaultDatabaseRow;

    const { results, migratedLegacyRows } = await decryptVaultRows({
      rows: [row],
      cache: new Map(),
      derivedKey,
    });

    expect(migratedLegacyRows).toBe(false);
    expect(results[0]!.item).toMatchObject({
      id: 'broken-row',
      title: ENCRYPTED_MARKER,
      username: ENCRYPTED_MARKER,
      url: '',
      category: 'card',
      favorite: false,
      deleted: true,
      createdAt: '2025-06-01',
      updatedAt: '2025-06-02',
    });
    expect(logSecurityEvent).toHaveBeenCalledWith(
      securityEventCodes.storageLegacyMigrationFailed,
      expect.stringContaining('broken-row'),
      'warning',
      { itemId: 'broken-row', error: expect.any(String) },
    );
  });

  it('maps set row flags into failure fallback items with the category default', async () => {
    const row = {
      ...buildVaultItemRow({
        id: 'broken-row-2',
        encrypted: { iv: 'aa', data: 'nope' } as never,
        item: sampleItem({ id: 'broken-row-2', favorite: true, deleted: false, category: undefined as never }),
        createdAt: '2025-07-01',
        updatedAt: '2025-07-02',
      }),
    } as VaultDatabaseRow;

    const { results, migratedLegacyRows } = await decryptVaultRows({
      rows: [row],
      cache: new Map(),
      derivedKey,
    });

    expect(migratedLegacyRows).toBe(false);
    expect(results[0]!.item).toMatchObject({
      id: 'broken-row-2',
      favorite: true,
      deleted: false,
      category: 'login',
    });
  });

  it('re-encrypts cached entries when migration flags disable the fast path', async () => {
    const migrationKey = new Uint8Array(32).fill(11);
    const item = sampleItem({ id: 'cached-migrating-row' });
    const row = await buildEncryptedRow(item);
    const before = row.enc_metadata;
    const cache = new Map<string, { enc_metadata: string; item: VaultItem }>();
    cache.set(row.id, { enc_metadata: row.enc_metadata, item });

    const { results, migratedLegacyRows } = await decryptVaultRows({
      rows: [row],
      cache,
      derivedKey,
      migration: {
        migrationKey,
        migratedSalt: 'salt-x',
        shouldMigrateKdf: false,
        shouldMigrateStaticSalt: true,
      },
    });

    // The cached item is used as the decryption source, but the row is
    // still re-encrypted under the migration key.
    expect(results[0]!.item.title).toBe('Email Account');
    expect(row.enc_metadata).not.toBe(before);
    expect(migratedLegacyRows).toBe(true);

    // The re-encrypted row opens under the new chain.
    const reopened = await decryptVaultRows({
      rows: [row],
      cache: new Map(),
      derivedKey: migrationKey,
    });
    expect(reopened.results[0]!.item.title).toBe('Email Account');
  });

  it('honours each migration flag independently', async () => {
    const migrationKey = new Uint8Array(32).fill(13);

    for (const flags of [
      { shouldMigrateKdf: true, shouldMigrateStaticSalt: false },
      { shouldMigrateKdf: false, shouldMigrateStaticSalt: true },
    ] as const) {
      const item = sampleItem({ id: `flag-row-${flags.shouldMigrateKdf ? 'kdf' : 'salt'}` });
      const row = await buildEncryptedRow(item);
      const { migratedLegacyRows } = await decryptVaultRows({
        rows: [row],
        cache: new Map(),
        derivedKey,
        migration: { migrationKey, migratedSalt: 's', ...flags },
      });
      expect(migratedLegacyRows).toBe(true);
    }
  });

  it('re-encrypts every row under the migration key when KDF migration is requested', async () => {
    const migrationKey = new Uint8Array(32).fill(9);
    const item = sampleItem({ id: 'migrating-row' });
    const row = await buildEncryptedRow(item);
    const before = row.enc_metadata;
    const cache = new Map<string, { enc_metadata: string; item: VaultItem }>();

    const { results, migratedLegacyRows } = await decryptVaultRows({
      rows: [row],
      cache,
      derivedKey,
      migration: {
        migrationKey,
        migratedSalt: 'fresh-salt-hex',
        shouldMigrateKdf: true,
        shouldMigrateStaticSalt: true,
      },
    });

    expect(migratedLegacyRows).toBe(true);
    expect(results[0]!.item.title).toBe('Email Account');
    expect(row.enc_metadata).not.toBe(before);
    expect(row.enc_kdf).toBe(VAULT_ITEM_KDF);

    // The migrated row now opens under the NEW derivation chain.
    const newItemKey = await derivePerItemKey(migrationKey, row.id);
    const decryptedAgain = await decryptVaultRows({
      rows: [{ ...row, enc_metadata: row.enc_metadata }],
      cache: new Map(),
      derivedKey: migrationKey,
    });
    void newItemKey;
    expect(decryptedAgain.results[0]!.item.title).toBe('Email Account');
  });
});
