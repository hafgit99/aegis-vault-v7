/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';
import { migrateLegacyAttachmentsToAesGcm, reencryptAttachmentsForMasterPasswordChange } from './attachments';
import {
  combineMasterPasswordAndSecretKey,
  getSecretKeyFingerprint,
  normalizeAccountSecretKey,
} from './secretKey';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import { closeVaultSession, getActiveBackupPassword, getActiveMasterPassword, openVaultSession } from './vaultSession';
import { disableBiometric, hydrateBiometric } from './biometric';
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

const INITIAL_DEMO_ITEMS: VaultItem[] = [
  {
    id: '1',
    title: 'Demo Developer Portal',
    username: 'demo.dev@example.test',
    password: 'R7!mQ4#vL9$zP2@k',
    url: 'dev-portal.example.test',
    notes: 'Synthetic sample record. Replace it with your own credential.',
    createdAt: '2023-11-12',
    updatedAt: '2024-01-24',
    category: 'login',
    favorite: true,
  },
  {
    id: '2',
    title: 'Demo Team Admin',
    username: 'demo.admin@example.test',
    password: 'N8$cT2!wY6#rH5@p',
    url: 'team-admin.example.test',
    notes: 'Synthetic admin sample for layout and audit testing.',
    createdAt: '2023-10-05',
    updatedAt: '2024-02-18',
    category: 'login',
  },
  {
    id: '3',
    title: 'Demo Billing Vault',
    username: 'demo.billing@example.test',
    password: 'B6@tK9#sV3!qL8%w',
    url: 'billing.example.test',
    notes: 'Synthetic billing sample. No real financial service is represented.',
    createdAt: '2022-04-12',
    updatedAt: '2023-12-01',
    category: 'login',
  },
  {
    id: '4',
    title: 'Demo Media Account',
    username: 'demo.media@example.test',
    password: 'M4#nR8!vC2$sX7@d',
    url: 'media.example.test',
    notes: 'Synthetic shared-account sample.',
    createdAt: '2023-01-15',
    updatedAt: '2024-03-10',
    category: 'login',
  },
];

export async function initializeStorage(): Promise<void> {
  await sqliteOPFSInstance.hydrate();
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
  const activeCredential = getActiveMasterPassword();
  if (activeCredential?.startsWith('aegis-vault-v7:')) {
    const newlineIndex = activeCredential.indexOf('\n');
    if (newlineIndex !== -1) {
      const secretKey = activeCredential.substring(newlineIndex + 1);
      return combineMasterPasswordAndSecretKey(newPassword, secretKey);
    }
  }

  return resolveVaultCredential(newPassword);
}

function resolveCurrentVaultCredential(password: string): string {
  const activeCredential = getActiveMasterPassword();
  const activeBackupPassword = getActiveBackupPassword();
  if (activeCredential?.startsWith('aegis-vault-v7:') && activeBackupPassword === password) {
    return activeCredential;
  }

  return resolveVaultCredential(password);
}

/**
 * Validates the master password against the SQLite Argon2id signature.
 */
export async function verifyMasterPassword(password: string, secretKey?: string | null): Promise<boolean> {
  await initializeStorage();
  const credential = resolveVaultCredential(password, secretKey);
  const isCorrect = await sqliteOPFSInstance.verifyPassword(credential);
  if (isCorrect) {
    let rawMasterPassword = password;
    if (password.startsWith('aegis-vault-v7:')) {
      const newlineIndex = password.indexOf('\n');
      if (newlineIndex !== -1) {
        rawMasterPassword = password.substring('aegis-vault-v7:'.length, newlineIndex);
      }
    }
    openVaultSession(credential, rawMasterPassword);
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
  await sqliteOPFSInstance.setupMaster(credential);
  openVaultSession(credential, password);
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
  await sqliteOPFSInstance.reseedDemo(credential, INITIAL_DEMO_ITEMS);
}

export async function setupMasterPasswordWithSecretKey(
  password: string,
  secretKey: string,
  rememberSecretKeyOnThisDevice: boolean,
): Promise<void> {
  const normalizedSecretKey = normalizeAccountSecretKey(secretKey);
  const credential = combineMasterPasswordAndSecretKey(password, normalizedSecretKey);

  await initializeStorage();
  await sqliteOPFSInstance.setupMaster(credential);
  openVaultSession(credential, password);
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

  await sqliteOPFSInstance.reseedDemo(credential, INITIAL_DEMO_ITEMS);
}

export async function changeMasterPassword(oldPassword: string, newPassword: string): Promise<void> {
  await initializeStorage();
  const oldCredential = resolveCurrentVaultCredential(oldPassword);
  const isCorrectOld = await sqliteOPFSInstance.verifyPassword(oldCredential);
  if (!isCorrectOld) {
    throw new Error('current-master-password-invalid');
  }

  const newCredential = resolveRotatedVaultCredential(newPassword);
  const rotatedAttachmentCount = await reencryptAttachmentsForMasterPasswordChange(oldCredential, newCredential);
  try {
    await sqliteOPFSInstance.changeMasterPassword(oldCredential, newCredential);
  } catch (err) {
    if (rotatedAttachmentCount > 0) {
      await reencryptAttachmentsForMasterPasswordChange(newCredential, oldCredential);
    }
    throw err;
  }
  openVaultSession(newCredential, newPassword);
  disableBiometric();
  localStorage.setItem(STORAGE_KEYS.IS_SET_UP, 'true');
}

/**
 * Resets the master password and wipes all database contents.
 */
export async function resetSystem(): Promise<void> {
  await sqliteOPFSInstance.resetAll();
  closeVaultSession();
  localStorage.removeItem(STORAGE_KEYS.IS_SET_UP);
  localStorage.removeItem('aegis_sqlite_fallback');
  localStorage.removeItem(STORAGE_KEYS.SECRET_PROFILE);
  localStorage.removeItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

function getSessionMasterPassword(): string | null {
  return getActiveMasterPassword();
}

/**
 * Retrieves of clean vault items from database.
 */
export async function getVaultItems(): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  
  const rawItems = await sqliteOPFSInstance.getVaultItems(password);

  // Auto clean trash items older than 15 days
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
    return sqliteOPFSInstance.deletePermanentlyBatch(expiredIds, password);
  }
  return cleanItems;
}

/**
 * Saves or updates a vault item inside SQLite row.
 */
export async function saveVaultItem(item: VaultItem): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.saveVaultItem(item, password);
}

export async function saveVaultItems(items: VaultItem[], onProgress?: (count: number) => void): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  if (onProgress) {
    return sqliteOPFSInstance.saveVaultItems(items, password, onProgress);
  }
  return sqliteOPFSInstance.saveVaultItems(items, password);
}

/**
 * Deletes a vault item directly.
 */
export async function deleteVaultItem(id: string): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.deletePermanently(id, password);
}

/**
 * Moves a vault item to trash in SQLite.
 */
export async function moveToTrash(id: string): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  
  const items = await sqliteOPFSInstance.getVaultItems(password);
  const found = items.find(x => x.id === id);
  if (found) {
    found.deleted = true;
    found.deletedAt = new Date().toISOString();
    await sqliteOPFSInstance.saveVaultItem(found, password);
  }
  return sqliteOPFSInstance.getVaultItems(password);
}

/**
 * Restores a vault item from trash in SQLite.
 */
export async function restoreFromTrash(id: string): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];

  const items = await sqliteOPFSInstance.getVaultItems(password);
  const found = items.find(x => x.id === id);
  if (found) {
    found.deleted = false;
    delete found.deletedAt;
    await sqliteOPFSInstance.saveVaultItem(found, password);
  }
  return sqliteOPFSInstance.getVaultItems(password);
}

/**
 * Permanently deletes a vault item from the database.
 */
export async function deletePermanently(id: string): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.deletePermanently(id, password);
}

/**
 * Empties the trash completely in SQLite.
 */
export async function emptyTrashComplete(): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];

  const items = await sqliteOPFSInstance.getVaultItems(password);
  const deletedIds = items.filter(item => item.deleted).map(item => item.id);
  
  if (deletedIds.length > 0) {
    return sqliteOPFSInstance.deletePermanentlyBatch(deletedIds, password);
  }
  return items;
}

/**
 * Re-seeds the system with default demo items inside SQLite.
 */
export async function reseedDemoData(): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.reseedDemo(password, INITIAL_DEMO_ITEMS);
}
