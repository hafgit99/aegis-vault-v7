/**
 * @vitest-environment jsdom
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testVaultKey = vi.hoisted(() => new Uint8Array(32).fill(7));

const sqliteOPFSInstance = vi.hoisted(() => ({
  deletePermanently: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  deletePermanentlyWithKey: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  deletePermanentlyBatch: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  deletePermanentlyBatchWithKey: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  deriveEncryptionKey: vi.fn(async (..._args: any[]): Promise<Uint8Array> => testVaultKey),
  getVaultItems: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  getVaultItemsWithKey: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  hydrate: vi.fn(async (..._args: any[]): Promise<void> => undefined),
  reseedDemo: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  reseedDemoWithKey: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  resetAll: vi.fn(async (..._args: any[]): Promise<void> => undefined),
  changeMasterPassword: vi.fn(async (..._args: any[]): Promise<void> => undefined),
  saveVaultItem: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  saveVaultItemWithKey: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  setItemTrashedWithKey: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  saveVaultItems: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  saveVaultItemsWithKey: vi.fn(async (..._args: any[]): Promise<VaultItem[]> => []),
  setupMaster: vi.fn(async (..._args: any[]): Promise<void> => undefined),
  verifyPassword: vi.fn(async (..._args: any[]): Promise<boolean> => false),
}));

const migrateLegacyAttachmentsToAesGcm = vi.hoisted(() => vi.fn(async () => 0));
const reencryptAttachmentsForVaultKeyChange = vi.hoisted(() => vi.fn(async () => 0));
const disableBiometric = vi.hoisted(() => vi.fn());
const hydrateBiometric = vi.hoisted(() => vi.fn(async () => undefined));
const runWaSqliteActiveBackendMigration = vi.hoisted(() => vi.fn());
const clearPersistedActiveVaultStorageBackend = vi.hoisted(() => vi.fn(() => {
  localStorage.removeItem('KalderaShield_vault_storage_active_backend');
}));
const getVaultStorageRepository = vi.hoisted(() => vi.fn(() => sqliteOPFSInstance));
const restoreOrActivateDefaultVaultStorageBackend = vi.hoisted(() => vi.fn(async () => 'kept-legacy-opfs'));

vi.mock('./sqlite_opfs', () => ({
  sqliteOPFSInstance,
}));

vi.mock('./attachments', () => ({
  migrateLegacyAttachmentsToAesGcm,
  reencryptAttachmentsForVaultKeyChange,
}));

vi.mock('./biometric', () => ({
  disableBiometric,
  hydrateBiometric,
}));

vi.mock('./vaultStorageActiveMigration', () => ({
  runWaSqliteActiveBackendMigration,
}));

vi.mock('./vaultStorageProvider', () => ({
  clearPersistedActiveVaultStorageBackend,
  getVaultStorageRepository,
  restoreOrActivateDefaultVaultStorageBackend,
}));

vi.mock('./indexedDbStorage', () => ({
  initializeIndexedDbStorage: vi.fn(async () => undefined),
  getIndexedDbItemSync: vi.fn((key: string) => localStorage.getItem(key)),
  setIndexedDbItemSync: vi.fn((key: string, value: string) => localStorage.setItem(key, value)),
  removeIndexedDbItemSync: vi.fn((key: string) => localStorage.removeItem(key)),
  clearAllSetupFlagsSync: vi.fn(() => {
    localStorage.removeItem('KalderaShield_is_setup');
    localStorage.removeItem('kalderashield_fallback');
    localStorage.removeItem('KalderaShield_account_secret_profile');
    localStorage.removeItem('KalderaShield_account_secret_key_remembered');
    localStorage.removeItem('KalderaShield_vault_storage_active_backend');
  }),
}));

import {
  deletePermanently,
  deleteVaultItem,
  emptyTrashComplete,
  getVaultItems,
  getRememberedAccountSecretKey,
  isAccountSecretKeyRequired,
  isMasterPasswordSet,
  moveToTrash,
  purgeExpiredTrashItems,
  reseedDemoData,
  resetSystem,
  restoreFromTrash,
  saveVaultItem,
  saveVaultItems,
  changeMasterPassword,
  setupMasterPassword,
  setupMasterPasswordWithSecretKey,
  verifyMasterPassword,
  initializeStorage,
  isVaultStorageUnreadableError,
  isVaultStorageUnavailableError,
  migrateActiveVaultStorageToWaSqlite,
  rememberAccountSecretKey,
  forgetRememberedAccountSecretKey,
} from './storage';
import { closeVaultSession, hasActiveBackupPassword, hasActiveMasterPassword, openVaultSession, withActiveVaultEncryptionKey } from './vaultSession';
import type { VaultItem } from '../types';

function sampleItem(overrides: Partial<VaultItem> = {}): VaultItem {
  return {
    id: 'item-1',
    title: 'Email',
    username: 'ada',
    password: 'secret',
    url: 'https://example.test',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
    category: 'login',
    ...overrides,
  };
}

beforeEach(() => {
  sqliteOPFSInstance.getVaultItemsWithKey.mockImplementation(() => (sqliteOPFSInstance.getVaultItems as any)('session-key'));
  sqliteOPFSInstance.saveVaultItemWithKey.mockImplementation((item: VaultItem) => sqliteOPFSInstance.saveVaultItem(item, 'session-key'));
  sqliteOPFSInstance.saveVaultItemsWithKey.mockImplementation((items: VaultItem[], _key: Uint8Array, onProgress?: (count: number) => void) => sqliteOPFSInstance.saveVaultItems(items, 'session-key', onProgress));
  sqliteOPFSInstance.deletePermanentlyWithKey.mockImplementation((id: string) => sqliteOPFSInstance.deletePermanently(id, 'session-key'));
  sqliteOPFSInstance.deletePermanentlyBatchWithKey.mockImplementation((ids: string[]) => sqliteOPFSInstance.deletePermanentlyBatch(ids, 'session-key'));
  sqliteOPFSInstance.reseedDemoWithKey.mockImplementation((_key: Uint8Array, items: VaultItem[]) => sqliteOPFSInstance.reseedDemo('session-key', items));
});

afterEach(() => {
  vi.useRealTimers();
  closeVaultSession();
  delete window.KalderaShieldAndroidSecureStorage;
  delete (window as any).__TAURI_INTERNALS__;
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  getVaultStorageRepository.mockReturnValue(sqliteOPFSInstance);
  restoreOrActivateDefaultVaultStorageBackend.mockResolvedValue('kept-legacy-opfs');
});

describe('vault session storage', () => {
  it('initializes restored active storage, biometric state, and secure-storage migration in order', async () => {
    const secureValues = new Map<string, string>();
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };
    localStorage.setItem('KalderaShield_account_secret_key_remembered', 'A3-LEGACY-SECRET');

    await initializeStorage();

    expect(restoreOrActivateDefaultVaultStorageBackend).toHaveBeenCalledTimes(1);
    expect(getVaultStorageRepository).toHaveBeenCalledTimes(1);
    expect(sqliteOPFSInstance.hydrate).toHaveBeenCalledTimes(1);
    expect(hydrateBiometric).toHaveBeenCalledTimes(1);
    expect(restoreOrActivateDefaultVaultStorageBackend.mock.invocationCallOrder[0]).toBeLessThan(
      getVaultStorageRepository.mock.invocationCallOrder[0]!,
    );
    // hydrateBiometric and vault repo hydrate now run concurrently,
    // so we only assert both were called (no strict ordering).
    expect(sqliteOPFSInstance.hydrate).toHaveBeenCalledTimes(1);
    expect(hydrateBiometric).toHaveBeenCalledTimes(1);
    expect(window.KalderaShieldAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'KalderaShield_account_secret_key_remembered',
      'A3-LEGACY-SECRET',
    );
    expect(localStorage.getItem('KalderaShield_account_secret_key_remembered')).toBeNull();
  });

  it('hydrates the repository restored by the persisted wa-sqlite marker during initialization', async () => {
    const restoredRepository = {
      ...sqliteOPFSInstance,
      hydrate: vi.fn(async () => undefined),
    };
    restoreOrActivateDefaultVaultStorageBackend.mockImplementationOnce(async () => {
      getVaultStorageRepository.mockReturnValue(restoredRepository as unknown as typeof sqliteOPFSInstance);
      return 'restored-wa-sqlite';
    });

    await initializeStorage();

    expect(restoreOrActivateDefaultVaultStorageBackend).toHaveBeenCalledTimes(1);
    expect(restoredRepository.hydrate).toHaveBeenCalledTimes(1);
    expect(sqliteOPFSInstance.hydrate).not.toHaveBeenCalled();
    expect(hydrateBiometric).toHaveBeenCalledTimes(1);
  });

  it('routes unlock, backup reads, and import writes through the restored wa-sqlite repository after restart', async () => {
    const storedItem = sampleItem({ id: 'restored-item', title: 'Restored wa-sqlite Item' });
    const savedItem = sampleItem({ id: 'saved-item', title: 'Saved After Restore' });
    const importedItem = sampleItem({ id: 'imported-item', title: 'Imported After Restore' });
    const restoredRepository = {
      ...sqliteOPFSInstance,
      hydrate: vi.fn(async () => undefined),
      verifyPassword: vi.fn(() => true),
      deriveEncryptionKey: vi.fn(async () => testVaultKey),
      getVaultItems: vi.fn(() => [storedItem]),
      getVaultItemsWithKey: vi.fn(() => [storedItem]),
      saveVaultItem: vi.fn(() => [storedItem, savedItem]),
      saveVaultItemWithKey: vi.fn(() => [storedItem, savedItem]),
      saveVaultItems: vi.fn(() => [storedItem, importedItem]),
      saveVaultItemsWithKey: vi.fn(() => [storedItem, importedItem]),
    };
    restoreOrActivateDefaultVaultStorageBackend.mockImplementationOnce(async () => {
      getVaultStorageRepository.mockReturnValue(restoredRepository as unknown as typeof sqliteOPFSInstance);
      return 'restored-wa-sqlite';
    });

    await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);
    await expect(getVaultItems()).resolves.toEqual([storedItem]);
    await expect(saveVaultItem(savedItem)).resolves.toEqual([storedItem, savedItem]);
    await expect(saveVaultItems([importedItem])).resolves.toEqual([storedItem, importedItem]);

    expect(restoredRepository.hydrate).toHaveBeenCalledTimes(1);
    expect(restoredRepository.verifyPassword).toHaveBeenCalledWith('master-pass');
    expect(restoredRepository.deriveEncryptionKey).toHaveBeenCalledWith('master-pass');
    expect(restoredRepository.getVaultItemsWithKey).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(restoredRepository.saveVaultItemWithKey).toHaveBeenCalledWith(savedItem, expect.any(Uint8Array));
    expect(restoredRepository.saveVaultItemsWithKey).toHaveBeenCalledWith([importedItem], expect.any(Uint8Array));
    expect(restoredRepository.getVaultItems).not.toHaveBeenCalled();
    expect(restoredRepository.saveVaultItem).not.toHaveBeenCalled();
    expect(restoredRepository.saveVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.verifyPassword).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.getVaultItemsWithKey).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItem).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItemWithKey).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItemsWithKey).not.toHaveBeenCalled();
  });

  it('opens an in-memory session during setup without writing the master password to sessionStorage', async () => {
    await setupMasterPassword('master-pass');

    expect(sqliteOPFSInstance.setupMaster).toHaveBeenCalledWith('master-pass');
    expect(hasActiveMasterPassword()).toBe(true);
    expect(sessionStorage.getItem('KalderaShield_session_master_pass')).toBeNull();
    expect(localStorage.getItem('KalderaShield_is_setup')).toBe('true');
    expect(sqliteOPFSInstance.reseedDemoWithKey).not.toHaveBeenCalled();
  });

  it('sets up a secret-key protected vault and can remember the second key locally', async () => {
    const storageMap = new Map<string, string>();
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn((key) => storageMap.get(key) ?? null),
      setItem: vi.fn((key, val) => { storageMap.set(key, val); return true; }),
      removeItem: vi.fn((key) => { storageMap.delete(key); return true; }),
    };

    await setupMasterPasswordWithSecretKey(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      true,
    );

    expect(sqliteOPFSInstance.setupMaster).toHaveBeenCalledWith(
      'kalderashield:master-pass\0A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(isAccountSecretKeyRequired()).toBe(true);
    expect(getRememberedAccountSecretKey()).toBe('A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567');
    expect(hasActiveMasterPassword()).toBe(true);
    expect(hasActiveBackupPassword()).toBe(true);
    expect(localStorage.getItem('KalderaShield_is_setup')).toBe('true');
    expect(sqliteOPFSInstance.reseedDemoWithKey).not.toHaveBeenCalled();
  });

  it('refuses to store remembered secret keys in device storage when hardware secure bridge is absent (R-5)', () => {
    delete (window as any).KalderaShieldAndroidSecureStorage;

    const stored = rememberAccountSecretKey('  a3-abcd-efgh-ijkl-mnop-qrst-uvwx-yz23-4567  ');

    expect(stored).toBe(false);
    expect(localStorage.getItem('KalderaShield_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBeNull();
  });

  it('removes remembered secret keys from both secure storage and the legacy fallback', () => {
    const secureValues = new Map<string, string>([[
      'KalderaShield_account_secret_key_remembered',
      'A3-SECURE-SECRET',
    ]]);
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };
    localStorage.setItem('KalderaShield_account_secret_key_remembered', 'A3-LEGACY-SECRET');

    forgetRememberedAccountSecretKey();

    expect(window.KalderaShieldAndroidSecureStorage.removeItem).toHaveBeenCalledWith(
      'KalderaShield_account_secret_key_remembered',
    );
    expect(localStorage.getItem('KalderaShield_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBeNull();
  });

  it('stores remembered secret keys in Android secure storage when the bridge is available', async () => {
    const secureValues = new Map<string, string>();
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };

    await setupMasterPasswordWithSecretKey(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      true,
    );

    expect(window.KalderaShieldAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'KalderaShield_account_secret_key_remembered',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(localStorage.getItem('KalderaShield_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBe('A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567');
  });

  it('migrates legacy remembered secret keys into Android secure storage during initialization', async () => {
    const secureValues = new Map<string, string>();
    window.KalderaShieldAndroidSecureStorage = {
      getItem: vi.fn((key) => secureValues.get(key) ?? null),
      setItem: vi.fn((key, value) => {
        secureValues.set(key, value);
        return true;
      }),
      removeItem: vi.fn((key) => secureValues.delete(key)),
    };
    localStorage.setItem('KalderaShield_account_secret_key_remembered', 'A3-LEGACY-SECRET');
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(false);

    await verifyMasterPassword('wrong-pass');

    expect(window.KalderaShieldAndroidSecureStorage.setItem).toHaveBeenCalledWith(
      'KalderaShield_account_secret_key_remembered',
      'A3-LEGACY-SECRET',
    );
    expect(localStorage.getItem('KalderaShield_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBe('A3-LEGACY-SECRET');
  });

  it('opens an in-memory session after a successful password verification', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);

    await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

    expect(hasActiveMasterPassword()).toBe(true);
    expect(migrateLegacyAttachmentsToAesGcm).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('KalderaShield_session_master_pass')).toBeNull();
  });

  it('verifies secret-key protected vaults with the combined credential', async () => {
    localStorage.setItem('KalderaShield_account_secret_profile', JSON.stringify({
      enabled: true,
      fingerprint: '3456-7',
    }));
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);

    await expect(verifyMasterPassword(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    )).resolves.toBe(true);

    expect(sqliteOPFSInstance.verifyPassword).toHaveBeenCalledWith(
      'kalderashield:master-pass\0A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
    );
    expect(hasActiveMasterPassword()).toBe(true);
    expect(hasActiveBackupPassword()).toBe(true);
  });

  it('rotates the master password without reseeding or wiping vault items', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    openVaultSession('old-master-pass', 'old-master-pass', testVaultKey);

    await changeMasterPassword('old-master-pass', 'new-master-pass-12');

    expect(reencryptAttachmentsForVaultKeyChange).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      'old-master-pass',
    );
    expect(sqliteOPFSInstance.changeMasterPassword).toHaveBeenCalledWith(
      'old-master-pass',
      'new-master-pass-12',
    );
    expect(sqliteOPFSInstance.reseedDemo).not.toHaveBeenCalled();
    expect(hasActiveMasterPassword()).toBe(true);
    expect(hasActiveBackupPassword()).toBe(true);
  });

  it('rotates only the master password portion for secret-key protected vaults', async () => {
    localStorage.setItem('KalderaShield_account_secret_profile', JSON.stringify({
      enabled: true,
      fingerprint: '3456-7',
    }));
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    openVaultSession('kalderashield:old-master-pass\0A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567', 'old-master-pass', testVaultKey);

    await changeMasterPassword('old-master-pass', 'new-master-pass-12');

    const newCredential = 'kalderashield:new-master-pass-12\0A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567';
    expect(sqliteOPFSInstance.changeMasterPassword).toHaveBeenCalledWith(
      'kalderashield:old-master-pass\0A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      newCredential,
    );
    expect(hasActiveMasterPassword()).toBe(true);
    expect(hasActiveBackupPassword()).toBe(true);
  });

  it('rolls attachment encryption back when vault password rotation fails', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    sqliteOPFSInstance.changeMasterPassword.mockRejectedValueOnce(new Error('db failed'));
    reencryptAttachmentsForVaultKeyChange.mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    openVaultSession('old-master-pass', 'old-master-pass', testVaultKey);

    await expect(changeMasterPassword('old-master-pass', 'new-master-pass-12')).rejects.toThrow('db failed');

    expect(reencryptAttachmentsForVaultKeyChange).toHaveBeenNthCalledWith(
      1,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      'old-master-pass',
    );
    expect(reencryptAttachmentsForVaultKeyChange).toHaveBeenNthCalledWith(
      2,
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      'new-master-pass-12',
    );
  });

  it('keeps a successful unlock when legacy attachment migration fails', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValue(true);
    migrateLegacyAttachmentsToAesGcm.mockRejectedValueOnce(new Error('migration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

      expect(hasActiveMasterPassword()).toBe(true);
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'attachment.legacyMigration.failed',
        severity: 'warning',
        source: 'KalderaShieldSecurity',
        meta: expect.objectContaining({ error: 'migration failed' }),
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('uses the active in-memory session for vault reads', () => {
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    getVaultItems();

    expect(sqliteOPFSInstance.getVaultItemsWithKey).toHaveBeenCalledWith(expect.any(Uint8Array));
    expect(sqliteOPFSInstance.getVaultItems).toHaveBeenCalledWith('session-key');
  });

  it('clears the in-memory session when the system is reset', async () => {
    openVaultSession('master-pass', 'master-pass', testVaultKey);
    localStorage.setItem('KalderaShield_vault_storage_active_backend', JSON.stringify({ backend: 'wa-sqlite' }));

    await resetSystem();

    expect(hasActiveMasterPassword()).toBe(false);
    expect(clearPersistedActiveVaultStorageBackend).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('KalderaShield_vault_storage_active_backend')).toBeNull();
  });
  it('requires an active session before running wa-sqlite active backend migration', async () => {
    await expect(migrateActiveVaultStorageToWaSqlite()).rejects.toThrow(
      'vault-storage-active-migration-session-required',
    );

    expect(runWaSqliteActiveBackendMigration).not.toHaveBeenCalled();
  });

  it('runs wa-sqlite active backend migration with the active session credential', async () => {
    runWaSqliteActiveBackendMigration.mockResolvedValueOnce({
      status: 'promoted',
      issues: [],
      readinessReport: { status: 'ready', issues: [] },
      smokeResult: {
        status: 'passed',
        databaseName: '/KalderaShield-wa-sqlite.desktop.db',
        vfsName: 'KalderaShield-wa-sqlite-desktop-idb',
      },
      dryRunResult: null,
      persistentMigrationCandidateResult: null,
      promotionResult: null,
    });
    localStorage.removeItem('KalderaShield_is_setup');
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(migrateActiveVaultStorageToWaSqlite()).resolves.toMatchObject({
      status: 'promoted',
      issues: [],
    });

    expect(runWaSqliteActiveBackendMigration).toHaveBeenCalledWith('master-pass');
    expect(localStorage.getItem('KalderaShield_is_setup')).toBe('true');
  });

  // ─── Y-12: promotion must not leave the pre-migration key in the session ───
  //
  // `runVaultStorageMigration` calls `targetRepository.setupMaster(...)`, which
  // mints a brand new random salt, and then writes every migrated row under
  // `Argon2id(credential, newSalt)`. The pre-migration session key is
  // `Argon2id(credential, oldOpfsSalt)`. Reusing it made the very first
  // `changeMasterPassword` after promotion fail with
  // `WA_SQLITE_ROW_DECRYPT_ERROR` on the first row.

  /** The key the promoted (wa-sqlite) repository derives under its NEW salt. */
  const PROMOTED_KEY_BYTE = 0x5a;
  /** The key the OPFS repository derived under its OLD salt. */
  const preMigrationVaultKey = new Uint8Array(32).fill(0x11);

  /** Built fresh: production code zeroizes the array it derived. */
  const expectedPromotedKey = () => new Uint8Array(32).fill(PROMOTED_KEY_BYTE);

  function readSessionKey(): Uint8Array | null {
    return withActiveVaultEncryptionKey((key) => new Uint8Array(key)) ?? null;
  }

  function mockPromotedMigration() {
    runWaSqliteActiveBackendMigration.mockResolvedValueOnce({
      status: 'promoted',
      issues: [],
      readinessReport: { status: 'ready', issues: [] },
      smokeResult: {
        status: 'passed',
        databaseName: '/KalderaShield-wa-sqlite.desktop.db',
        vfsName: 'KalderaShield-wa-sqlite-desktop-idb',
      },
      dryRunResult: null,
      persistentMigrationCandidateResult: null,
      promotionResult: null,
    });
  }

  it('Y-12: replaces the pre-migration session key with the promoted repository key', async () => {
    mockPromotedMigration();
    sqliteOPFSInstance.deriveEncryptionKey.mockResolvedValueOnce(expectedPromotedKey());
    localStorage.removeItem('KalderaShield_is_setup');
    // The session still holds the OLD OP's key at promotion time.
    openVaultSession('master-pass', 'master-pass', preMigrationVaultKey);

    await migrateActiveVaultStorageToWaSqlite();

    const sessionKey = readSessionKey();
    expect(sessionKey).toEqual(expectedPromotedKey());
    // Regression: the pre-migration key must not survive promotion.
    expect(sessionKey).not.toEqual(preMigrationVaultKey);
  });

  it('Y-12: derives from the promoted repository even when a session key is already held', async () => {
    mockPromotedMigration();
    sqliteOPFSInstance.deriveEncryptionKey.mockResolvedValueOnce(expectedPromotedKey());
    localStorage.removeItem('KalderaShield_is_setup');
    openVaultSession('master-pass', 'master-pass', preMigrationVaultKey);

    await migrateActiveVaultStorageToWaSqlite();

    // The old `if (existingKey)` shortcut skipped this call entirely.
    expect(sqliteOPFSInstance.deriveEncryptionKey).toHaveBeenCalledWith('master-pass');
  });

  it('Y-12: does not re-derive when the migration is blocked', async () => {
    runWaSqliteActiveBackendMigration.mockResolvedValueOnce({
      status: 'blocked',
      issues: ['wa-sqlite-promotion-blocked'],
      readinessReport: { status: 'blocked', issues: ['wa-sqlite-promotion-blocked'] },
      smokeResult: { status: 'passed', databaseName: '/KalderaShield-wa-sqlite.desktop.db', vfsName: 'KalderaShield-wa-sqlite-desktop-idb' },
      dryRunResult: null,
      persistentMigrationCandidateResult: null,
      promotionResult: null,
    });
    sqliteOPFSInstance.deriveEncryptionKey.mockClear();
    localStorage.removeItem('KalderaShield_is_setup');
    openVaultSession('master-pass', 'master-pass', preMigrationVaultKey);

    await migrateActiveVaultStorageToWaSqlite();

    // Nothing was promoted, so the existing key is still correct.
    expect(sqliteOPFSInstance.deriveEncryptionKey).not.toHaveBeenCalled();
    expect(readSessionKey()).toEqual(preMigrationVaultKey);
  });

  it('Y-12: propagates a derivation failure instead of silently keeping a stale key', async () => {
    mockPromotedMigration();
    sqliteOPFSInstance.deriveEncryptionKey.mockRejectedValueOnce(
      new Error('derive-from-promoted-repository-failed'),
    );
    localStorage.removeItem('KalderaShield_is_setup');
    openVaultSession('master-pass', 'master-pass', preMigrationVaultKey);

    // Failing loudly matters: silently retaining the pre-migration key is
    // exactly the bug — it would break password rotation on first use.
    await expect(migrateActiveVaultStorageToWaSqlite()).rejects.toThrow(
      'derive-from-promoted-repository-failed',
    );
  });

  it('Y-12: zeroizes the derived key copy it hands to the session', async () => {
    mockPromotedMigration();
    const derived = expectedPromotedKey();
    sqliteOPFSInstance.deriveEncryptionKey.mockResolvedValueOnce(derived);
    localStorage.removeItem('KalderaShield_is_setup');
    openVaultSession('master-pass', 'master-pass', preMigrationVaultKey);

    await migrateActiveVaultStorageToWaSqlite();

    // The local copy is wiped after being handed off, but the session keeps a
    // working copy.
    expect(derived.every((byte) => byte === 0)).toBe(true);
    expect(readSessionKey()).toEqual(expectedPromotedKey());
  });

  it('preserves secret-key combined credentials during wa-sqlite active backend migration', async () => {
    const combinedCredential = 'kalderashield:master-pass\0A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567';
    runWaSqliteActiveBackendMigration.mockResolvedValueOnce({
      status: 'blocked',
      issues: ['wa-sqlite-promotion-dry-run-not-run'],
      readinessReport: {
        status: 'blocked',
        issues: ['wa-sqlite-promotion-dry-run-not-run'],
      },
      smokeResult: {
        status: 'passed',
        databaseName: '/KalderaShield-wa-sqlite.desktop.db',
        vfsName: 'KalderaShield-wa-sqlite-desktop-idb',
      },
      dryRunResult: null,
      persistentMigrationCandidateResult: null,
      promotionResult: null,
    });
    localStorage.removeItem('KalderaShield_is_setup');
    openVaultSession(combinedCredential, 'master-pass');

    await expect(migrateActiveVaultStorageToWaSqlite()).resolves.toMatchObject({
      status: 'blocked',
      issues: ['wa-sqlite-promotion-dry-run-not-run'],
    });

    expect(runWaSqliteActiveBackendMigration).toHaveBeenCalledWith(combinedCredential);
    expect(localStorage.getItem('KalderaShield_is_setup')).toBeNull();
  });

  it('Y-13: surfaces an unavailable wa-sqlite backend instead of continuing with an empty vault', async () => {
    // Regression: `initializeStorage` discarded the startup backend status, so a
    // persisted-but-unopenable wa-sqlite vault silently became an empty one.
    restoreOrActivateDefaultVaultStorageBackend.mockResolvedValueOnce('wa-sqlite-unavailable');

    await expect(initializeStorage()).rejects.toThrow('vault-storage-unavailable');

    // Nothing was read from, or written to, any repository.
    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
  });

  it('Y-13: marks the unavailable backend as a distinct error type, not unreadable', async () => {
    // The database is intact. The UI must offer "retry", not "restore a
    // snapshot", and must not count it as a wrong password.
    restoreOrActivateDefaultVaultStorageBackend.mockResolvedValueOnce('wa-sqlite-unavailable');

    const error = await initializeStorage().then(() => null, (e: unknown) => e);

    expect(isVaultStorageUnavailableError(error)).toBe(true);
    expect(isVaultStorageUnreadableError(error)).toBe(false);
  });

  it('Y-13: does not throw when the backend is available', async () => {
    restoreOrActivateDefaultVaultStorageBackend.mockResolvedValueOnce('restored-wa-sqlite');

    await expect(initializeStorage()).resolves.toBeUndefined();
  });

  it('handles reencryptAttachments error during changeMasterPassword', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    reencryptAttachmentsForVaultKeyChange.mockRejectedValueOnce(new Error('reencrypt failed'));
    openVaultSession('old-pass', 'old-pass', testVaultKey);

    await expect(changeMasterPassword('old-pass', 'new-pass-1234')).rejects.toThrow('reencrypt failed');
  });

  it('handles missing old vault key and derive key failure during changeMasterPassword', async () => {
    // Missing old vault key (no session)
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    await expect(changeMasterPassword('old-pass', 'new-pass-1234')).rejects.toThrow(
      'vault-storage-active-migration-session-required',
    );

    // Derive key error
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    sqliteOPFSInstance.deriveEncryptionKey.mockRejectedValueOnce(new Error('derive failed'));
    openVaultSession('old-pass', 'old-pass', testVaultKey);

    await expect(changeMasterPassword('old-pass', 'new-pass-1234')).rejects.toThrow('derive failed');
  });

  it('handles wa-sqlite active migration errors including android runtime and wasm memory error', async () => {
    // Android runtime check
    (window as any).__TAURI_INTERNALS__ = {};
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', configurable: true });
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(migrateActiveVaultStorageToWaSqlite()).rejects.toThrow(
      'wa-sqlite-android-webview-wasm-memory-unsupported',
    );

    delete (window as any).__TAURI_INTERNALS__;
    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });

    // WASM memory error
    runWaSqliteActiveBackendMigration.mockRejectedValueOnce(new Error('memory access out of bounds in wasm'));
    await expect(migrateActiveVaultStorageToWaSqlite()).rejects.toThrow(
      'wa-sqlite-webview-wasm-memory-unsupported',
    );

    // General migration error
    runWaSqliteActiveBackendMigration.mockRejectedValueOnce(new Error('custom migration failure'));
    await expect(migrateActiveVaultStorageToWaSqlite()).rejects.toThrow('custom migration failure');
  });

  it('detects setup from the versioned sqlite fallback before using the legacy setup flag', () => {
    localStorage.setItem('kalderashield_fallback', JSON.stringify({
      user_secrets: [{ username: 'owner', argon_hash: '$argon2id$salt$hash' }],
    }));

    expect(isMasterPasswordSet()).toBe(true);

    localStorage.setItem('kalderashield_fallback', '{not json');
    expect(isMasterPasswordSet()).toBe(false);

    localStorage.setItem('KalderaShield_is_setup', 'true');
    expect(isMasterPasswordSet()).toBe(true);
  });


  it('does not treat empty or malformed fallback user secret arrays as setup', () => {
    localStorage.setItem('kalderashield_fallback', JSON.stringify({ user_secrets: [] }));
    expect(isMasterPasswordSet()).toBe(false);

    localStorage.setItem('kalderashield_fallback', JSON.stringify({ user_secrets: null }));
    expect(isMasterPasswordSet()).toBe(false);

    localStorage.setItem('kalderashield_fallback', JSON.stringify({ records: [{ id: 'secret' }] }));
    expect(isMasterPasswordSet()).toBe(false);
  });

  it('returns empty lists for mutating wrappers when no vault session is active', async () => {
    await expect(saveVaultItem(sampleItem())).resolves.toEqual([]);
    await expect(deleteVaultItem('item-1')).resolves.toEqual([]);
    await expect(moveToTrash('item-1')).resolves.toEqual([]);
    await expect(restoreFromTrash('item-1')).resolves.toEqual([]);
    await expect(deletePermanently('item-1')).resolves.toEqual([]);
    await expect(saveVaultItems([sampleItem()], vi.fn())).resolves.toEqual([]);
    await expect(emptyTrashComplete()).resolves.toEqual([]);
    await expect(reseedDemoData()).resolves.toEqual([]);

    expect(sqliteOPFSInstance.saveVaultItem).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.deletePermanently).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.reseedDemo).not.toHaveBeenCalled();
  });

  it('passes the active session vault key to save, delete, and reseed wrappers', async () => {
    const item = sampleItem();
    sqliteOPFSInstance.saveVaultItem.mockResolvedValue([item]);
    sqliteOPFSInstance.deletePermanently.mockResolvedValue([]);
    sqliteOPFSInstance.reseedDemo.mockResolvedValue([item]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(saveVaultItem(item)).resolves.toEqual([item]);
    await expect(deleteVaultItem('item-1')).resolves.toEqual([]);
    await expect(deletePermanently('item-1')).resolves.toEqual([]);
    await expect(reseedDemoData()).resolves.toEqual([item]);

    expect(sqliteOPFSInstance.saveVaultItemWithKey).toHaveBeenCalledWith(item, expect.any(Uint8Array));
    expect(sqliteOPFSInstance.deletePermanentlyWithKey).toHaveBeenNthCalledWith(1, 'item-1', expect.any(Uint8Array));
    expect(sqliteOPFSInstance.deletePermanentlyWithKey).toHaveBeenNthCalledWith(2, 'item-1', expect.any(Uint8Array));
    expect(sqliteOPFSInstance.reseedDemoWithKey).toHaveBeenCalledWith(expect.any(Uint8Array), expect.arrayContaining([
      expect.objectContaining({ id: '1', title: 'Demo Developer Portal' }),
    ]));
  });

  it('moves items to trash and restores them through the targeted update', async () => {
    const activeItem = sampleItem();
    sqliteOPFSInstance.setItemTrashedWithKey.mockResolvedValue([activeItem]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await moveToTrash('item-1');

    expect(sqliteOPFSInstance.setItemTrashedWithKey).toHaveBeenCalledWith(
      'item-1',
      true,
      expect.any(Uint8Array),
    );

    await restoreFromTrash('item-1');

    expect(sqliteOPFSInstance.setItemTrashedWithKey).toHaveBeenLastCalledWith(
      'item-1',
      false,
      expect.any(Uint8Array),
    );
  });

  it('does not rewrite the item when flagging it', async () => {
    // Y-15 regression: the old path wrote the whole item back, which reverted
    // any field that changed between the read and the write.
    const activeItem = sampleItem();
    sqliteOPFSInstance.setItemTrashedWithKey.mockResolvedValue([activeItem]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await moveToTrash('item-1');

    expect(sqliteOPFSInstance.saveVaultItemWithKey).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItemsWithKey).not.toHaveBeenCalled();
  });

  it('delegates missing-item handling to the repository', async () => {
    // Whether the row exists is now the repository's decision, so this layer
    // only asserts that it forwards the request rather than reading the vault.
    sqliteOPFSInstance.setItemTrashedWithKey.mockResolvedValue([]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await moveToTrash('missing-item');
    await restoreFromTrash('missing-item');

    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItemWithKey).not.toHaveBeenCalled();
  });

  // ─── Y-14: reading the vault must never destroy data ──────────────────────
  //
  // `getVaultItems` used to permanently delete every trashed item past the
  // 15-day retention window as a side effect of reading. It had 11 call sites,
  // including `createVaultSnapshot`, `restoreVaultSnapshot`, `useSettingsSync`
  // and `useSettingsPasskey` — so taking a backup, restoring one, or syncing to
  // WebDAV/S3 all silently destroyed trashed items.

  it('Y-14: getVaultItems does NOT delete expired trash', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const activeItem = sampleItem({ id: 'active-item' });
    const recentTrash = sampleItem({
      id: 'recent-trash',
      deleted: true,
      deletedAt: '2026-01-25T00:00:00.000Z',
    });
    const expiredTrash = sampleItem({
      id: 'expired-trash',
      deleted: true,
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([activeItem, recentTrash, expiredTrash]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    // The core regression: a read is pure and returns everything.
    await expect(getVaultItems()).resolves.toEqual([activeItem, recentTrash, expiredTrash]);

    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.deletePermanentlyBatch).not.toHaveBeenCalled();
  });

  it('Y-14: getVaultItems is a pure read with no write calls at all', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    // An expired trashed item is exactly the input that used to trigger the
    // destructive write, so this must not be a "no expired items" trivial case.
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([
      sampleItem({ id: 'expired-trash', deleted: true, deletedAt: '2026-01-01T00:00:00.000Z' }),
    ]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await getVaultItems();

    expect(sqliteOPFSInstance.saveVaultItemWithKey).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItemsWithKey).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.deletePermanentlyWithKey).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).not.toHaveBeenCalled();
  });

  it('Y-14: purgeExpiredTrashItems deletes only items past the retention window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const activeItem = sampleItem({ id: 'active-item' });
    const recentTrash = sampleItem({
      id: 'recent-trash',
      deleted: true,
      deletedAt: '2026-01-25T00:00:00.000Z',
    });
    const expiredTrash = sampleItem({
      id: 'expired-trash',
      deleted: true,
      deletedAt: '2026-01-01T00:00:00.000Z',
    });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([activeItem, recentTrash, expiredTrash]);
    sqliteOPFSInstance.deletePermanentlyBatch.mockResolvedValueOnce([activeItem, recentTrash]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    const result = await purgeExpiredTrashItems();

    expect(result.purgedCount).toBe(1);
    expect(result.items).toEqual([activeItem, recentTrash]);
    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).toHaveBeenCalledWith(['expired-trash'], expect.any(Uint8Array));
  });

  it('Y-14: purgeExpiredTrashItems writes nothing when nothing has expired', async () => {
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([sampleItem({ id: 'active-item' })]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    const result = await purgeExpiredTrashItems();

    expect(result.purgedCount).toBe(0);
    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).not.toHaveBeenCalled();
  });

  it('Y-14: purgeExpiredTrashItems ignores items with an unparsable deletedAt', async () => {
    const corrupt = sampleItem({ id: 'corrupt', deleted: true, deletedAt: 'not-a-date' });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([corrupt]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    const result = await purgeExpiredTrashItems();

    // A NaN comparison would otherwise silently expire or retain unpredictably.
    expect(result.purgedCount).toBe(0);
    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).not.toHaveBeenCalled();
  });

  it('Y-14: purgeExpiredTrashItems is a no-op without an active session', async () => {
    const result = await purgeExpiredTrashItems();

    expect(result).toEqual({ items: [], purgedCount: 0 });
    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).not.toHaveBeenCalled();
  });


  it('empties only deleted items from trash', async () => {
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([
      sampleItem({ id: 'active-item' }),
      sampleItem({ id: 'trash-1', deleted: true }),
      sampleItem({ id: 'trash-2', deleted: true }),
    ]);
    sqliteOPFSInstance.deletePermanentlyBatch.mockResolvedValueOnce([sampleItem({ id: 'active-item' })]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(emptyTrashComplete()).resolves.toEqual([sampleItem({ id: 'active-item' })]);

    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).toHaveBeenCalledWith(['trash-1', 'trash-2'], expect.any(Uint8Array));
  });

  it('passes the active session vault key to saveVaultItems bulk save wrapper', async () => {
    const item = sampleItem();
    sqliteOPFSInstance.saveVaultItems.mockResolvedValue([item]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(saveVaultItems([item])).resolves.toEqual([item]);

    expect(sqliteOPFSInstance.saveVaultItemsWithKey).toHaveBeenCalledWith([item], expect.any(Uint8Array));
  });

  it('returns database-normalized records from the bulk save wrapper', async () => {
    const importedItem = sampleItem({ id: '', title: '' });
    const normalizedItem = sampleItem({
      id: 'generated-id',
      title: 'Imported Record',
      createdAt: '2026-06-26',
      updatedAt: '2026-06-26',
    });
    sqliteOPFSInstance.saveVaultItems.mockResolvedValueOnce([normalizedItem]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(saveVaultItems([importedItem])).resolves.toEqual([normalizedItem]);

    expect(sqliteOPFSInstance.saveVaultItemsWithKey).toHaveBeenCalledWith([importedItem], expect.any(Uint8Array));
  });

  it('ignores missing, disabled, or malformed account secret-key profiles', () => {
    expect(isAccountSecretKeyRequired()).toBe(false);

    localStorage.setItem('KalderaShield_account_secret_profile', JSON.stringify({ enabled: false, fingerprint: '3456-7' }));
    expect(isAccountSecretKeyRequired()).toBe(false);

    localStorage.setItem('KalderaShield_account_secret_profile', '{not json');
    expect(isAccountSecretKeyRequired()).toBe(false);
  });

  it('falls back to the raw master password when a secret-key profile has no usable key', async () => {
    localStorage.setItem('KalderaShield_account_secret_profile', JSON.stringify({
      enabled: true,
      fingerprint: '3456-7',
    }));
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);

    await expect(verifyMasterPassword('master-pass')).resolves.toBe(true);

    expect(sqliteOPFSInstance.verifyPassword).toHaveBeenCalledWith('master-pass');
    expect(hasActiveMasterPassword()).toBe(true);
  });

  it('accepts already combined credentials while keeping the raw master password as backup', async () => {
    const combinedCredential = 'kalderashield:master-pass\0A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567';
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);

    await expect(verifyMasterPassword(combinedCredential)).resolves.toBe(true);

    expect(sqliteOPFSInstance.verifyPassword).toHaveBeenCalledWith(combinedCredential);
    expect(hasActiveMasterPassword()).toBe(true);
    expect(hasActiveBackupPassword()).toBe(true);
  });

  it('does not open a vault session after failed verification', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(false);

    await expect(verifyMasterPassword('wrong-pass')).resolves.toBe(false);

    expect(hasActiveMasterPassword()).toBe(false);
    expect(migrateLegacyAttachmentsToAesGcm).not.toHaveBeenCalled();
  });

  it('keeps setup successful when legacy attachment migration fails', async () => {
    migrateLegacyAttachmentsToAesGcm.mockRejectedValueOnce(new Error('setup migration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(setupMasterPassword('master-pass')).resolves.toBeUndefined();

      expect(sqliteOPFSInstance.setupMaster).toHaveBeenCalledWith('master-pass');
      expect(localStorage.getItem('KalderaShield_is_setup')).toBe('true');
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'attachment.legacyMigration.failed',
        severity: 'warning',
        source: 'KalderaShieldSecurity',
        meta: expect.objectContaining({ error: 'setup migration failed' }),
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });


  it('keeps secret-key setup successful when legacy attachment migration fails', async () => {
    migrateLegacyAttachmentsToAesGcm.mockRejectedValueOnce(new Error('secret setup migration failed'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await expect(setupMasterPasswordWithSecretKey(
        'master-pass',
        'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
        false,
      )).resolves.toBeUndefined();

      expect(localStorage.getItem('KalderaShield_is_setup')).toBe('true');
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({
        code: 'attachment.legacyMigration.failed',
        severity: 'warning',
        source: 'KalderaShieldSecurity',
        meta: expect.objectContaining({ error: 'secret setup migration failed' }),
      }));
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('forgets any remembered secret key when setup chooses not to remember this device', async () => {
    localStorage.setItem('KalderaShield_account_secret_key_remembered', 'A3-OLD-SECRET');

    await setupMasterPasswordWithSecretKey(
      'master-pass',
      'A3-ABCD-EFGH-IJKL-MNOP-QRST-UVWX-YZ23-4567',
      false,
    );

    expect(localStorage.getItem('KalderaShield_account_secret_key_remembered')).toBeNull();
    expect(getRememberedAccountSecretKey()).toBeNull();
  });

  it('rejects master password rotation when the current password is invalid', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(false);

    await expect(changeMasterPassword('wrong-pass', 'new-master-pass-12')).rejects.toThrow(
      'current-master-password-invalid',
    );

    expect(reencryptAttachmentsForVaultKeyChange).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.changeMasterPassword).not.toHaveBeenCalled();
  });

  it('does not roll attachment encryption back when no attachments were rotated', async () => {
    sqliteOPFSInstance.verifyPassword.mockResolvedValueOnce(true);
    reencryptAttachmentsForVaultKeyChange.mockResolvedValueOnce(0);
    sqliteOPFSInstance.changeMasterPassword.mockRejectedValueOnce(new Error('db failed'));
    openVaultSession('old-master-pass', 'old-master-pass', testVaultKey);

    await expect(changeMasterPassword('old-master-pass', 'new-master-pass-12')).rejects.toThrow('db failed');

    expect(reencryptAttachmentsForVaultKeyChange).toHaveBeenCalledTimes(1);
    expect(reencryptAttachmentsForVaultKeyChange).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.any(Uint8Array),
      'old-master-pass',
    );
  });

  it('removes setup, fallback, and secret-key markers when the vault is reset', async () => {
    localStorage.setItem('KalderaShield_is_setup', 'true');
    localStorage.setItem('kalderashield_fallback', '{"user_secrets":[{}]}');
    localStorage.setItem('KalderaShield_account_secret_profile', '{"enabled":true}');
    localStorage.setItem('KalderaShield_account_secret_key_remembered', 'A3-OLD-SECRET');
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await resetSystem();

    expect(sqliteOPFSInstance.resetAll).toHaveBeenCalledTimes(1);
    expect(hasActiveMasterPassword()).toBe(false);
    expect(localStorage.getItem('KalderaShield_is_setup')).toBeNull();
    expect(localStorage.getItem('kalderashield_fallback')).toBeNull();
    expect(localStorage.getItem('KalderaShield_account_secret_profile')).toBeNull();
    expect(localStorage.getItem('KalderaShield_account_secret_key_remembered')).toBeNull();
  });

  it('returns an empty item list when reads happen without an active session', async () => {
    await expect(getVaultItems()).resolves.toEqual([]);

    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
  });

  it('returns active vault items unchanged when no trash cleanup is needed', async () => {
    const activeItem = sampleItem({ id: 'active-item' });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([activeItem]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(getVaultItems()).resolves.toEqual([activeItem]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).not.toHaveBeenCalled();
  });

  it('treats trash items at the exact retention boundary as expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const boundaryTrash = sampleItem({
      id: 'boundary-trash',
      deleted: true,
      deletedAt: '2026-01-17T00:00:00.000Z',
    });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([boundaryTrash]);
    sqliteOPFSInstance.deletePermanentlyBatch.mockResolvedValueOnce([]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    // Y-14: the boundary is now enforced by the explicit purge, not by reading.
    const result = await purgeExpiredTrashItems();

    expect(result.purgedCount).toBe(1);
    expect(sqliteOPFSInstance.deletePermanentlyBatchWithKey).toHaveBeenCalledWith(['boundary-trash'], expect.any(Uint8Array));
  });

  it('keeps trash items younger than the retention window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const recentTrash = sampleItem({
      id: 'recent-trash',
      deleted: true,
      deletedAt: '2026-01-17T00:00:01.000Z',
    });
    // Both the read and the explicit purge observe the same vault contents.
    sqliteOPFSInstance.getVaultItems
      .mockResolvedValueOnce([recentTrash])
      .mockResolvedValueOnce([recentTrash]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(getVaultItems()).resolves.toEqual([recentTrash]);
    await expect(purgeExpiredTrashItems()).resolves.toEqual({ items: [recentTrash], purgedCount: 0 });

    expect(sqliteOPFSInstance.deletePermanentlyBatch).not.toHaveBeenCalled();
  });

  // ─── Y-15: targeted trash updates ─────────────────────────────────────────

  it('Y-15: moveToTrash uses the targeted flag update, not a full rewrite', async () => {
    sqliteOPFSInstance.setItemTrashedWithKey.mockResolvedValueOnce([sampleItem({ id: 'trash-me', deleted: true })]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await moveToTrash('trash-me');

    expect(sqliteOPFSInstance.setItemTrashedWithKey).toHaveBeenCalledWith(
      'trash-me',
      true,
      expect.any(Uint8Array),
    );
    // The regression: the whole vault was read, mutated and written back.
    expect(sqliteOPFSInstance.getVaultItems).not.toHaveBeenCalled();
    expect(sqliteOPFSInstance.saveVaultItemWithKey).not.toHaveBeenCalled();
  });

  it('Y-15: restoreFromTrash uses the targeted flag update', async () => {
    sqliteOPFSInstance.setItemTrashedWithKey.mockResolvedValueOnce([sampleItem({ id: 'back' })]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await restoreFromTrash('back');

    expect(sqliteOPFSInstance.setItemTrashedWithKey).toHaveBeenCalledWith(
      'back',
      false,
      expect.any(Uint8Array),
    );
    expect(sqliteOPFSInstance.saveVaultItemWithKey).not.toHaveBeenCalled();
  });

  it('Y-15: falls back to read-modify-write when the repository has no targeted update', async () => {
    // Optional interface method: a repository that does not implement it must
    // still work, so the old path is kept as a fallback.
    const repository = { ...sqliteOPFSInstance };
    delete (repository as Partial<typeof sqliteOPFSInstance>).setItemTrashedWithKey;
    getVaultStorageRepository.mockReturnValue(repository);
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([sampleItem({ id: 'trash-me' })]);
    sqliteOPFSInstance.saveVaultItemWithKey.mockResolvedValueOnce([]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await moveToTrash('trash-me');

    expect(sqliteOPFSInstance.saveVaultItemWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'trash-me', deleted: true }),
      expect.any(Uint8Array),
    );
  });

  it('passes progress callbacks through the bulk save wrapper', async () => {
    const item = sampleItem();
    const onProgress = vi.fn();
    sqliteOPFSInstance.saveVaultItems.mockResolvedValueOnce([item]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(saveVaultItems([item], onProgress)).resolves.toEqual([item]);

    expect(sqliteOPFSInstance.saveVaultItemsWithKey).toHaveBeenCalledWith([item], expect.any(Uint8Array), onProgress);
  });

  it('returns existing items when empty trash has no deleted entries', async () => {
    const activeItem = sampleItem({ id: 'active-item' });
    sqliteOPFSInstance.getVaultItems.mockResolvedValueOnce([activeItem]);
    openVaultSession('master-pass', 'master-pass', testVaultKey);

    await expect(emptyTrashComplete()).resolves.toEqual([activeItem]);

    expect(sqliteOPFSInstance.deletePermanentlyBatch).not.toHaveBeenCalled();
  });

});
