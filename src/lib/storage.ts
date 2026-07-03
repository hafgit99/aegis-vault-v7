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
import { INITIAL_DEMO_ITEMS } from './storageDemoItems';
import {
  getSecureStorageItem,
  removeSecureStorageItem,
  secureStorageKeys,
  setSecureStorageItem,
} from './secureStorage';

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
  await restoreOrActivateDefaultVaultStorageBackend({
    hasLegacyOpfsVaultData: isMasterPasswordSet,
  });
  await getVaultStorageRepository().hydrate();
  await hydrateBiometric();
  migrateRememberedSecretKeyToSecureStorage();
}

/**
 * Checks if a master password has already been set up in SQLite database.
 */
export function isMasterPasswordSet(): boolean {
  const fallback = localStorage.getItem('aegis_sqlite_fallback');
  if (fallback) {
    try {
      const parsed = JSON.parse(fallback);
      if (parsed.user_secrets && parsed.user_secrets.length > 0) {
        return true;
      }
    } catch(e) {}
  }
  return localStorage.getItem(STORAGE_KEYS.IS_SET_UP) === 'true';
}

function readSecretProfile(): AccountSecretProfile | null {
  const raw = localStorage.getItem(STORAGE_KEYS.SECRET_PROFILE);
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
    ?? localStorage.getItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

export function rememberAccountSecretKey(secretKey: string): void {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  if (setSecureStorageItem(secureStorageKeys.rememberedSecretKey, normalizedSecretKey)) {
    localStorage.removeItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
    return;
  }

  localStorage.setItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY, normalizedSecretKey);
}

export function forgetRememberedAccountSecretKey(): void {
  removeSecureStorageItem(secureStorageKeys.rememberedSecretKey);
  localStorage.removeItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

function migrateRememberedSecretKeyToSecureStorage(): void {
  const legacySecretKey = localStorage.getItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
  if (!legacySecretKey) return;

  if (setSecureStorageItem(secureStorageKeys.rememberedSecretKey, legacySecretKey)) {
    localStorage.removeItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
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

function resolveRotatedVaultCredential(newPassword: string): string {
  const rotatedWithActiveSecret = withActiveAccountSecretKey((secretKey) => (
    combineMasterPasswordAndSecretKey(newPassword, secretKey)
  ));

  return rotatedWithActiveSecret ?? resolveVaultCredential(newPassword);
}

function resolveCurrentVaultCredential(password: string): string {
  return withActiveSessionSecrets((activeCredential, activeBackupPassword) => {
    if (activeCredential.startsWith('aegis-vault-v7:') && activeBackupPassword === password) {
      return activeCredential;
    }

    return resolveVaultCredential(password);
  }) ?? resolveVaultCredential(password);
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
  const credential = resolveVaultCredential(password, secretKey);
  const isCorrect = await getVaultStorageRepository().verifyPassword(credential);
  if (isCorrect) {
    let rawMasterPassword = password;
    if (password.startsWith('aegis-vault-v7:')) {
      const newlineIndex = password.indexOf('\n');
      if (newlineIndex !== -1) {
        rawMasterPassword = password.substring('aegis-vault-v7:'.length, newlineIndex);
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

/**
 * Safe utility to store the master password with Argon2id signature.
 */
export async function setupMasterPassword(password: string): Promise<void> {
  await initializeStorage();
  const credential = resolveVaultCredential(password);
  await getVaultStorageRepository().setupMaster(credential);
  await openDerivedVaultSession(credential, password);
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
  localStorage.setItem(STORAGE_KEYS.IS_SET_UP, 'true');

  // Seed default items in SQLite
  const seedKey = await getVaultStorageRepository().deriveEncryptionKey(credential);
  try {
    await getVaultStorageRepository().reseedDemoWithKey!(seedKey, INITIAL_DEMO_ITEMS);
  } finally {
    seedKey.fill(0);
  }
}

export async function setupMasterPasswordWithSecretKey(
  password: string,
  secretKey: string,
  rememberSecretKeyOnThisDevice: boolean,
): Promise<void> {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  const credential = combineMasterPasswordAndSecretKey(password, normalizedSecretKey);

  await initializeStorage();
  await getVaultStorageRepository().setupMaster(credential);
  await openDerivedVaultSession(credential, password);
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
  localStorage.setItem(STORAGE_KEYS.IS_SET_UP, 'true');
  localStorage.setItem(STORAGE_KEYS.SECRET_PROFILE, JSON.stringify({
    enabled: true,
    fingerprint: getSecretKeyFingerprint(normalizedSecretKey),
  }));

  if (rememberSecretKeyOnThisDevice) {
    rememberAccountSecretKey(normalizedSecretKey);
  } else {
    forgetRememberedAccountSecretKey();
  }

  const seedKey = await getVaultStorageRepository().deriveEncryptionKey(credential);
  try {
    await getVaultStorageRepository().reseedDemoWithKey!(seedKey, INITIAL_DEMO_ITEMS);
  } finally {
    seedKey.fill(0);
  }
}

export async function changeMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
  await initializeStorage();
  const oldCredential = resolveCurrentVaultCredential(oldPassword);
  const isCorrectOld = await getVaultStorageRepository().verifyPassword(oldCredential);
  if (!isCorrectOld) {
    throw new Error('current-master-password-invalid');
  }

  const newCredential = resolveRotatedVaultCredential(newPassword);

  // Derive the old and new vault encryption keys up front so attachment
  // re-encryption can run through the key-only path instead of materializing
  // the master password string. The old key is read from the active session
  // (already derived at unlock); the new key is derived from the rotated
  // credential. Both copies are zeroized once the rotation completes.
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
      oldCredential, // legacy master-password fallback for pre-vault-key records
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
      // Rollback: re-encrypt attachments back onto the old vault key.
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
  localStorage.setItem(STORAGE_KEYS.IS_SET_UP, 'true');
}

/**
 * Resets the master password and wipes all database contents.
 */
export async function resetSystem(): Promise<void> {
  await getVaultStorageRepository().resetAll();
  closeVaultSession();
  localStorage.removeItem(STORAGE_KEYS.IS_SET_UP);
  localStorage.removeItem('aegis_sqlite_fallback');
  localStorage.removeItem(STORAGE_KEYS.SECRET_PROFILE);
  localStorage.removeItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
  clearPersistedActiveVaultStorageBackend();
}

export async function migrateActiveVaultStorageToWaSqlite(): Promise<WaSqliteActiveBackendMigrationResult> {
  const result = withActiveSessionSecrets(async (credential) => {
    const migrationResult = await runWaSqliteActiveBackendMigration(credential);
    if (migrationResult.status === 'promoted') {
      localStorage.setItem(STORAGE_KEYS.IS_SET_UP, 'true');
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
  return withSessionVaultKey([], (vaultKey) => getVaultStorageRepository().reseedDemoWithKey!(vaultKey, INITIAL_DEMO_ITEMS));
}
