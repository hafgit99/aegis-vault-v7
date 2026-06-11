/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';
import { migrateLegacyAttachmentsToAesGcm } from './attachments';
import {
  combineMasterPasswordAndSecretKey,
  getSecretKeyFingerprint,
  normalizeAccountSecretKey,
} from './secretKey';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { closeVaultSession, getActiveMasterPassword, openVaultSession } from './vaultSession';

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
    title: 'GitHub',
    username: 'username_aegis',
    password: 'G8x#kL9@pQ2!mZ7',
    url: 'github.com',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    notes: 'Backup recovery codes are stored in an offline safe.',
    createdAt: '2023-11-12',
    updatedAt: '2024-01-24',
    category: 'login',
    favorite: true,
  },
  {
    id: '2',
    title: 'Google Workspace',
    username: 'admin@aegisvault.local',
    password: 'S@f3P@$$w0rd2024!',
    url: 'workspace.google.com',
    totpSecret: 'KVKVE43VNVSTCTKP',
    notes: 'Primary admin console account.',
    createdAt: '2023-10-05',
    updatedAt: '2024-02-18',
    category: 'login',
  },
  {
    id: '3',
    title: 'Chase Bank',
    username: 'main_account_01',
    password: 'password123',
    url: 'chase.com',
    notes: 'Used only for bill payments.',
    createdAt: '2022-04-12',
    updatedAt: '2023-12-01',
    category: 'login',
  },
  {
    id: '4',
    title: 'Spotify Family',
    username: 'music_fanatic',
    password: 'S0ng$OfTh3Decade#',
    url: 'spotify.com',
    notes: 'Shared subscription account for family members.',
    createdAt: '2023-01-15',
    updatedAt: '2024-03-10',
    category: 'login',
  },
];

export async function initializeStorage(): Promise<void> {
  await sqliteOPFSInstance.hydrate();
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
  return localStorage.getItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

export function rememberAccountSecretKey(secretKey: string): void {
  localStorage.setItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY, normalizeAccountSecretKey(secretKey));
}

export function forgetRememberedAccountSecretKey(): void {
  localStorage.removeItem(STORAGE_KEYS.REMEMBERED_SECRET_KEY);
}

function resolveVaultCredential(password: string, secretKey?: string | null): string {
  const profile = readSecretProfile();
  if (!profile) return password;

  const usableSecretKey = secretKey || getRememberedAccountSecretKey();
  if (!usableSecretKey) return password;

  return combineMasterPasswordAndSecretKey(password, usableSecretKey);
}

/**
 * Validates the master password against the SQLite Argon2id signature.
 */
export async function verifyMasterPassword(password: string, secretKey?: string | null): Promise<boolean> {
  await initializeStorage();
  const credential = resolveVaultCredential(password, secretKey);
  const isCorrect = await sqliteOPFSInstance.verifyPassword(credential);
  if (isCorrect) {
    openVaultSession(credential, password);
    try {
      await migrateLegacyAttachmentsToAesGcm();
    } catch (err) {
      console.warn('Legacy attachment migration failed after unlock:', err);
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
    console.warn('Legacy attachment migration failed after setup:', err);
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
    console.warn('Legacy attachment migration failed after setup:', err);
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

/**
 * Resets the master password and wipes all database contents.
 */
export function resetSystem(): void {
  sqliteOPFSInstance.resetAll();
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
    for (const id of expiredIds) {
      await sqliteOPFSInstance.deletePermanently(id, password);
    }
    return sqliteOPFSInstance.getVaultItems(password);
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
  for (const item of items) {
    if (item.deleted) {
      await sqliteOPFSInstance.deletePermanently(item.id, password);
    }
  }
  return sqliteOPFSInstance.getVaultItems(password);
}

/**
 * Re-seeds the system with default demo items inside SQLite.
 */
export async function reseedDemoData(): Promise<VaultItem[]> {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.reseedDemo(password, INITIAL_DEMO_ITEMS);
}
