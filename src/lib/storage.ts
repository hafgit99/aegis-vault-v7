/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';
import { migrateLegacyAttachmentsToAesGcm, reencryptAttachmentsForVaultKeyChange } from './attachments';
import {
  combineMasterPasswordAndSecretKey,
  getSecretKeyFingerprint,
  normalizeAccountSecretKey,
} from './secretKey';
import { clearPersistedActiveVaultStorageBackend, getVaultStorageRepository, restoreOrActivateDefaultVaultStorageBackend } from './vaultStorageProvider';
import {
  runWaSqliteActiveBackendMigration,
  type WaSqliteActiveBackendMigrationResult,
} from './vaultStorageActiveMigration';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import {
  closeVaultSession,
  openVaultSession,
  updateActiveVaultEncryptionKey,
  withActiveAccountSecretKey,
  withActiveSessionSecrets,
  withActiveVaultEncryptionKey,
} from './vaultSession';
import { disableBiometric, hydrateBiometric } from './biometric';
import { createDemoItems } from './storageDemoItems';
import {
  getSecureStorageItem,
  removeSecureStorageItem,
  secureStorageKeys,
  setSecureStorageItem,
} from './secureStorage';
import {
  initializeIndexedDbStorage,
  getIndexedDbItemSync,
  setIndexedDbItemSync,
  removeIndexedDbItemSync,
  clearAllSetupFlagsSync,
} from './indexedDbStorage';
import { isAndroidRuntime, isDesktopRuntime } from './desktopStorage';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEYS = {
  IS_SET_UP: 'aegis_is_setup',
  SECRET_PROFILE: 'aegis_account_secret_profile',
  REMEMBERED_SECRET_KEY: 'aegis_account_secret_key_remembered',
};

interface AccountSecretProfile {
  enabled: true;
  fingerprint: string;
}

export async function initializeStorage(): Promise<void> {
  // Phase 1: IndexedDB cache must be ready before anything reads setup flags,
  // but biometric hydrate is completely independent — run them together.
  const biometricPromise = hydrateBiometric();
  await initializeIndexedDbStorage();

  // Phase 2: OPFS pre-hydrate (desktop only) and backend restore run concurrently.
  const opfsPromise = isDesktopRuntime()
    ? sqliteOPFSInstance.hydrate().catch((e: unknown) => {
        console.error('Failed to pre-hydrate sqliteOPFSInstance:', e);
      })
    : Promise.resolve();

  await Promise.all([
    opfsPromise,
    restoreOrActivateDefaultVaultStorageBackend({
      hasLegacyOpfsVaultData: isMasterPasswordSet,
    }),
  ]);

  // Phase 3: Vault repo hydrate + wait for biometric (should already be done).
  await Promise.all([
    getVaultStorageRepository().hydrate(),
    biometricPromise,
  ]);

  migrateRememberedSecretKeyToSecureStorage();
}


/**
 * Checks if a master password has already been set up in SQLite database.
 */
export function isMasterPasswordSet(): boolean {
  const fallback = getIndexedDbItemSync('aegis_sqlite_fallback');
  if (fallback) {
    try {
      const parsed = JSON.parse(fallback);
      if (parsed.user_secrets && parsed.user_secrets.length > 0) {
        return true;
      }
    } catch(e) {}
  }
  return getIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP) === 'true';
}

function readSecretProfile(): AccountSecretProfile | null {
  const raw = getIndexedDbItemSync(STORAGE_KEYS.SECRET_PROFILE);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AccountSecretProfile;
    return parsed.enabled ? parsed : null;
  } catch {
    return null;
  }
}

export function isAccountSecretKeyRequired(): boolean {
  return readSecretProfile() !== null;
}

export function getRememberedAccountSecretKey(): string | null {
  return getSecureStorageItem(secureStorageKeys.rememberedSecretKey)
    ?? getIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

export function rememberAccountSecretKey(secretKey: string): void {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  if (setSecureStorageItem(secureStorageKeys.rememberedSecretKey, normalizedSecretKey)) {
    removeIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
    return;
  }

  setIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY, normalizedSecretKey);
}

export function forgetRememberedAccountSecretKey(): void {
  removeSecureStorageItem(secureStorageKeys.rememberedSecretKey);
  removeIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

function migrateRememberedSecretKeyToSecureStorage(): void {
  const legacySecretKey = getIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
  if (!legacySecretKey) return;

  if (setSecureStorageItem(secureStorageKeys.rememberedSecretKey, legacySecretKey)) {
    removeIndexedDbItemSync(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
  }
}

function resolveVaultCredential(password: string, secretKey?: string | null): string {
  if (password.startsWith('aegis-vault-v7:')) {
    return password;
  }
  const profile = readSecretProfile();
  if (!profile) return password;

  const usableSecretKey = secretKey || getRememberedAccountSecretKey();
  if (!usableSecretKey) return password;

  return combineMasterPasswordAndSecretKey(password, usableSecretKey);
}

async function resolveRotatedVaultCredential(newPassword: string): Promise<string> {
  const rotatedWithActiveSecret = await withActiveAccountSecretKey((secretKey) => (
    combineMasterPasswordAndSecretKey(newPassword, secretKey)
  ));

  return rotatedWithActiveSecret ?? resolveVaultCredential(newPassword);
}

async function resolveCurrentVaultCredential(password: string): Promise<string> {
  const secrets = await withActiveSessionSecrets((activeCredential, activeBackupPassword) => {
    if (activeCredential.startsWith('aegis-vault-v7:') && activeBackupPassword === password) {
      return activeCredential;
    }

    return resolveVaultCredential(password);
  });
  return secrets ?? resolveVaultCredential(password);
}

/**
 * Validates the master password against the SQLite Argon2id signature.
 */
async function openDerivedVaultSession(credential: string, backupPassword: string): Promise<void> {
  const vaultEncryptionKey = await getVaultStorageRepository().deriveEncryptionKey(credential);
  const sessionVaultEncryptionKey = new Uint8Array(vaultEncryptionKey);
  try {
    openVaultSession(credential, backupPassword, sessionVaultEncryptionKey);
  } finally {
    vaultEncryptionKey.fill(0);
    sessionVaultEncryptionKey.fill(0);
  }
}

export async function verifyMasterPassword(password: string, secretKey?: string | null): Promise<boolean> {
  await initializeStorage();
  
  const usableSecretKey = secretKey || getRememberedAccountSecretKey();
  const credential = resolveVaultCredential(password, secretKey);

  if (isDesktopRuntime()) {
    const repo = getVaultStorageRepository();
    const salt = repo.getCurrentVaultEncryptionSalt ? await repo.getCurrentVaultEncryptionSalt() : 'aegis_vault_v7_db_encryption_salt';
    const kdfParams = repo.getKdfParams ? await repo.getKdfParams() : { memoryKiB: 32 * 1024, iterations: 3, parallelism: 1, hashLength: 32 };
    const argonHash = repo.getArgonHash ? await repo.getArgonHash() : '';

    try {
      const vaultKeyBytes = await invoke<number[]>('open_rust_session', {
        password: credential,
        backupPassword: password,
        argonHash,
        salt,
        kdfParams,
        secretKey: usableSecretKey || null,
      });

      const sessionVaultEncryptionKey = new Uint8Array(vaultKeyBytes);
      openVaultSession(credential, password, sessionVaultEncryptionKey);
      
      try {
        await migrateLegacyAttachmentsToAesGcm();
      } catch (err) {
        logSecurityEvent(
          securityEventCodes.attachmentLegacyMigrationFailed,
          'Legacy attachment migration failed after unlock.',
          'warning',
          { error: err instanceof Error ? err.message : String(err) },
        );
      }
      return true;
    } catch (err) {
      console.error('Rust unlock failed:', err);
      return false;
    }
  } else {
    const isCorrect = await getVaultStorageRepository().verifyPassword(credential);
    if (isCorrect) {
      let rawMasterPassword = password;
      if (password.startsWith('aegis-vault-v7:')) {
        const separatorIndex = password.indexOf('\0');
        if (separatorIndex !== -1) {
          rawMasterPassword = password.substring('aegis-vault-v7:'.length, separatorIndex);
        }
      }
      await openDerivedVaultSession(credential, rawMasterPassword);
      try {
        await migrateLegacyAttachmentsToAesGcm();
      } catch (err) {
        logSecurityEvent(
          securityEventCodes.attachmentLegacyMigrationFailed,
          'Legacy attachment migration failed after unlock.',
          'warning',
          { error: err instanceof Error ? err.message : String(err) },
        );
      }
    }
    return isCorrect;
  }
}

/**
 * Safe utility to store the master password with Argon2id signature.
 */
export async function setupMasterPassword(password: string): Promise<void> {
  await initializeStorage();
  
  if (isDesktopRuntime()) {
    const credential = resolveVaultCredential(password);
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const kdfParams = { memoryKiB: 32 * 1024, iterations: 3, parallelism: 1, hashLength: 32 };
    
    const result = await invoke<{
      vaultEncryptionKey: number[];
      argonHash: string;
      salt: string;
    }>('setup_rust_session', {
      password: credential,
      backupPassword: password,
      secretKey: null,
      salt,
      kdfParams,
    });

    const vaultKeyBytes = new Uint8Array(result.vaultEncryptionKey);
    const repo = getVaultStorageRepository();
    if (repo.setupMasterWithHash) {
      await repo.setupMasterWithHash(result.argonHash, result.salt, kdfParams);
    } else {
      const credential = resolveVaultCredential(password);
      await repo.setupMaster(credential);
    }
    
    openVaultSession(credential, password, vaultKeyBytes);
  } else {
    const credential = resolveVaultCredential(password);
    await getVaultStorageRepository().setupMaster(credential);
    await openDerivedVaultSession(credential, password);
  }

  try {
    await migrateLegacyAttachmentsToAesGcm();
  } catch (err) {
    logSecurityEvent(
      securityEventCodes.attachmentLegacyMigrationFailed,
      'Legacy attachment migration failed after setup.',
      'warning',
      { error: err instanceof Error ? err.message : String(err) },
    );
  }
  setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
}

export async function setupMasterPasswordWithSecretKey(
  password: string,
  secretKey: string,
  rememberSecretKeyOnThisDevice: boolean,
): Promise<void> {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  const credential = combineMasterPasswordAndSecretKey(password, normalizedSecretKey);

  await initializeStorage();

  if (isDesktopRuntime()) {
    const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const kdfParams = { memoryKiB: 32 * 1024, iterations: 3, parallelism: 1, hashLength: 32 };
    
    const result = await invoke<{
      vaultEncryptionKey: number[];
      argonHash: string;
      salt: string;
    }>('setup_rust_session', {
      password: credential,
      backupPassword: password,
      secretKey: normalizedSecretKey,
      salt,
      kdfParams,
    });

    const vaultKeyBytes = new Uint8Array(result.vaultEncryptionKey);
    const repo = getVaultStorageRepository();
    if (repo.setupMasterWithHash) {
      await repo.setupMasterWithHash(result.argonHash, result.salt, kdfParams);
    } else {
      await repo.setupMaster(credential);
    }
    
    openVaultSession(credential, password, vaultKeyBytes);
  } else {
    await getVaultStorageRepository().setupMaster(credential);
    await openDerivedVaultSession(credential, password);
  }

  try {
    await migrateLegacyAttachmentsToAesGcm();
  } catch (err) {
    logSecurityEvent(
      securityEventCodes.attachmentLegacyMigrationFailed,
      'Legacy attachment migration failed after setup.',
      'warning',
      { error: err instanceof Error ? err.message : String(err) },
    );
  }
  setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
  setIndexedDbItemSync(STORAGE_KEYS.SECRET_PROFILE, JSON.stringify({
    enabled: true,
    fingerprint: getSecretKeyFingerprint(normalizedSecretKey),
  }));

  if (rememberSecretKeyOnThisDevice) {
    rememberAccountSecretKey(normalizedSecretKey);
  } else {
    forgetRememberedAccountSecretKey();
  }
}

export async function changeMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
  await initializeStorage();
  
  if (isDesktopRuntime()) {
    const repo = getVaultStorageRepository();
    const newSalt = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const kdfParams = { memoryKiB: 32 * 1024, iterations: 3, parallelism: 1, hashLength: 32 };

    const oldCredential = await resolveCurrentVaultCredential(oldPassword);
    const newCredential = await resolveRotatedVaultCredential(newPassword);

    const result = await invoke<{
      newVaultKey: number[];
      newArgonHash: string;
    }>('rotate_rust_session', {
      oldPassword: oldCredential,
      newPassword: newCredential,
      backupPassword: newPassword,
      newSalt,
      kdfParams,
    });

    const newVaultKey = new Uint8Array(result.newVaultKey);
    const oldVaultKey = await withActiveVaultEncryptionKey(async (key) => new Uint8Array(key));
    if (!oldVaultKey) {
      throw new Error('vault-storage-active-migration-session-required');
    }

    let rotatedAttachmentCount = 0;
    try {
      const oldCredential = (await withActiveSessionSecrets((masterPassword) => masterPassword)) || '';
      rotatedAttachmentCount = await reencryptAttachmentsForVaultKeyChange(
        oldVaultKey,
        newVaultKey,
        oldCredential,
      );
    } catch (err) {
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    try {
      if (repo.changeMasterPasswordWithHash) {
        await repo.changeMasterPasswordWithHash(result.newArgonHash, newSalt, kdfParams, oldVaultKey, newVaultKey);
      } else {
        const oldCredential = (await withActiveSessionSecrets((masterPassword) => masterPassword)) || '';
        const newCredential = await resolveRotatedVaultCredential(newPassword);
        await repo.changeMasterPassword(oldCredential, newCredential);
      }
    } catch (err) {
      if (rotatedAttachmentCount > 0) {
        const oldCredential = (await withActiveSessionSecrets((masterPassword) => masterPassword)) || '';
        await reencryptAttachmentsForVaultKeyChange(newVaultKey, oldVaultKey, oldCredential).catch(() => {});
      }
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    openVaultSession(newCredential, newPassword, newVaultKey);

    oldVaultKey.fill(0);
    newVaultKey.fill(0);

    disableBiometric();
    setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
  } else {
    const oldCredential = await resolveCurrentVaultCredential(oldPassword);
    const isCorrectOld = await getVaultStorageRepository().verifyPassword(oldCredential);
    if (!isCorrectOld) {
      throw new Error('current-master-password-invalid');
    }

    const newCredential = await resolveRotatedVaultCredential(newPassword);

    const oldVaultKey = await withActiveVaultEncryptionKey(async (key) => new Uint8Array(key));
    if (!oldVaultKey) {
      throw new Error('vault-storage-active-migration-session-required');
    }

    let newVaultKey: Uint8Array;
    try {
      newVaultKey = await getVaultStorageRepository().deriveEncryptionKey(newCredential);
    } catch (err) {
      oldVaultKey.fill(0);
      throw err;
    }

    let rotatedAttachmentCount = 0;
    try {
      rotatedAttachmentCount = await reencryptAttachmentsForVaultKeyChange(
        oldVaultKey,
        newVaultKey,
        oldCredential,
      );
    } catch (err) {
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    try {
      await getVaultStorageRepository().changeMasterPassword(oldCredential, newCredential);
    } catch (err) {
      if (rotatedAttachmentCount > 0) {
        await reencryptAttachmentsForVaultKeyChange(newVaultKey, oldVaultKey, newCredential).catch(() => {});
      }
      oldVaultKey.fill(0);
      newVaultKey.fill(0);
      throw err;
    }

    oldVaultKey.fill(0);
    newVaultKey.fill(0);

    await openDerivedVaultSession(newCredential, newPassword);
    disableBiometric();
    setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
  }
}

/**
 * Resets the master password and wipes all database contents.
 */
export async function resetSystem(): Promise<void> {
  await getVaultStorageRepository().resetAll();
  closeVaultSession();
  clearAllSetupFlagsSync();
  clearPersistedActiveVaultStorageBackend();
}

export async function migrateActiveVaultStorageToWaSqlite(): Promise<WaSqliteActiveBackendMigrationResult> {
  if (isAndroidRuntime()) {
    throw new Error('wa-sqlite-android-webview-wasm-memory-unsupported');
  }

  const result = await withActiveSessionSecrets(async (credential) => {
    let migrationResult: WaSqliteActiveBackendMigrationResult;
    try {
      migrationResult = await runWaSqliteActiveBackendMigration(credential);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (/memory access out of bounds|out of memory|wasm/i.test(message)) {
        throw new Error('wa-sqlite-webview-wasm-memory-unsupported');
      }
      throw error;
    }
    if (migrationResult.status === 'promoted') {
      setIndexedDbItemSync(STORAGE_KEYS.IS_SET_UP, 'true');
      const newKey = await getVaultStorageRepository().deriveEncryptionKey(credential);
      updateActiveVaultEncryptionKey(newKey);
      newKey.fill(0);
    }
    return migrationResult;
  });

  if (!result) {
    throw new Error('vault-storage-active-migration-session-required');
  }
  return result;
}

async function withSessionVaultKey<T>(fallback: T, action: (vaultEncryptionKey: Uint8Array) => Promise<T>): Promise<T> {
  let keyCopy: Uint8Array | null = null;
  const result = withActiveVaultEncryptionKey((vaultEncryptionKey) => {
    keyCopy = vaultEncryptionKey;
    return action(vaultEncryptionKey);
  });
  if (!result) return fallback;
  try {
    return await result;
  } finally {
    keyCopy?.fill(0);
  }
}


/**
 * Retrieves of clean vault items from database.
 */
export async function getVaultItems(): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const rawItems = await getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);

    let hasChanges = false;
    const expiredIds: string[] = [];
    const now = new Date().getTime();
    const cleanItems = rawItems.filter((item) => {
      if (item.deleted && item.deletedAt) {
        const deletedTime = new Date(item.deletedAt).getTime();
        const diffDays = (now - deletedTime) / (1000 * 60 * 60 * 24);
        if (diffDays >= 15) {
          hasChanges = true;
          expiredIds.push(item.id);
          return false;
        }
      }
      return true;
    });

    if (hasChanges) {
      return getVaultStorageRepository().deletePermanentlyBatchWithKey!(expiredIds, vaultKey);
    }
    return cleanItems;
  });
}

/**
 * Saves or updates a vault item inside SQLite row.
 */
export async function saveVaultItem(item: VaultItem): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().saveVaultItemWithKey!(item, vaultKey));
}

export async function saveVaultItems(items: VaultItem[], onProgress?: (count: number) => void): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => {
    if (onProgress) {
      return getVaultStorageRepository().saveVaultItemsWithKey!(items, vaultKey, onProgress);
    }
    return getVaultStorageRepository().saveVaultItemsWithKey!(items, vaultKey);
  });
}

/**
 * Deletes a vault item directly.
 */
export async function deleteVaultItem(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().deletePermanentlyWithKey!(id, vaultKey));
}

/**
 * Moves a vault item to trash in SQLite.
 */
export async function moveToTrash(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const items = await getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
    const found = items.find(x => x.id === id);
    if (found) {
      found.deleted = true;
      found.deletedAt = new Date().toISOString();
      await getVaultStorageRepository().saveVaultItemWithKey!(found, vaultKey);
    }
    return getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
  });
}

/**
 * Restores a vault item from trash in SQLite.
 */
export async function restoreFromTrash(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const items = await getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
    const found = items.find(x => x.id === id);
    if (found) {
      found.deleted = false;
      delete found.deletedAt;
      await getVaultStorageRepository().saveVaultItemWithKey!(found, vaultKey);
    }
    return getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
  });
}

/**
 * Permanently deletes a vault item from the database.
 */
export async function deletePermanently(id: string): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().deletePermanentlyWithKey!(id, vaultKey));
}

/**
 * Empties the trash completely in SQLite.
 */
export async function emptyTrashComplete(): Promise<VaultItem[]> {
  return withSessionVaultKey([], async (vaultKey) => {
    const items = await getVaultStorageRepository().getVaultItemsWithKey!(vaultKey);
    const deletedIds = items.filter(item => item.deleted).map(item => item.id);

    if (deletedIds.length > 0) {
      return getVaultStorageRepository().deletePermanentlyBatchWithKey!(deletedIds, vaultKey);
    }
    return items;
  });
}

/**
 * Re-seeds the system with default demo items inside SQLite.
 */
export async function reseedDemoData(): Promise<VaultItem[]> {
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().reseedDemoWithKey!(vaultKey, createDemoItems()));
}
