/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../types';
import { sqliteOPFSInstance } from './sqlite_opfs';
import { closeVaultSession, getActiveMasterPassword, openVaultSession } from './vaultSession';

const STORAGE_KEYS = {
  IS_SET_UP: 'aegis_is_setup',
};

const INITIAL_DEMO_ITEMS: VaultItem[] = [
  {
    id: '1',
    title: 'GitHub',
    username: 'username_aegis',
    password: 'G8x#kL9@pQ2!mZ7',
    url: 'github.com',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    notes: 'Yedek kurtarma kodları fiziksel kasada saklanıyor.',
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
    notes: 'Sadece fatura ödemeleri için kullanılıyor.',
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
    notes: 'Aile üyeleri ile ortak abonelik hesabı.',
    createdAt: '2023-01-15',
    updatedAt: '2024-03-10',
    category: 'login',
  },
];

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

/**
 * Validates the master password against the SQLite Argon2id signature.
 */
export async function verifyMasterPassword(password: string): Promise<boolean> {
  const isCorrect = await sqliteOPFSInstance.verifyPassword(password);
  if (isCorrect) {
    openVaultSession(password);
  }
  return isCorrect;
}

/**
 * Safe utility to store the master password with Argon2id signature.
 */
export async function setupMasterPassword(password: string): Promise<void> {
  await sqliteOPFSInstance.setupMaster(password);
  openVaultSession(password);
  localStorage.setItem(STORAGE_KEYS.IS_SET_UP, 'true');

  // Seed default items in SQLite
  sqliteOPFSInstance.reseedDemo(password, INITIAL_DEMO_ITEMS);
}

/**
 * Resets the master password and wipes all database contents.
 */
export function resetSystem(): void {
  sqliteOPFSInstance.resetAll();
  closeVaultSession();
  localStorage.removeItem(STORAGE_KEYS.IS_SET_UP);
  localStorage.removeItem('aegis_sqlite_fallback');
}

function getSessionMasterPassword(): string | null {
  return getActiveMasterPassword();
}

/**
 * Retrieves of clean vault items from database.
 */
export function getVaultItems(): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];
  
  const rawItems = sqliteOPFSInstance.getVaultItems(password);

  // Auto clean trash items older than 15 days
  let hasChanges = false;
  const now = new Date().getTime();
  const cleanItems = rawItems.filter((item) => {
    if (item.deleted && item.deletedAt) {
      const deletedTime = new Date(item.deletedAt).getTime();
      const diffDays = (now - deletedTime) / (1000 * 60 * 60 * 24);
      if (diffDays >= 15) {
        hasChanges = true;
        sqliteOPFSInstance.deletePermanently(item.id, password);
        return false;
      }
    }
    return true;
  });

  if (hasChanges) {
    return sqliteOPFSInstance.getVaultItems(password);
  }
  return cleanItems;
}

/**
 * Saves or updates a vault item inside SQLite row.
 */
export function saveVaultItem(item: VaultItem): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.saveVaultItem(item, password);
}

/**
 * Deletes a vault item directly.
 */
export function deleteVaultItem(id: string): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.deletePermanently(id, password);
}

/**
 * Moves a vault item to trash in SQLite.
 */
export function moveToTrash(id: string): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];
  
  const items = sqliteOPFSInstance.getVaultItems(password);
  const found = items.find(x => x.id === id);
  if (found) {
    found.deleted = true;
    found.deletedAt = new Date().toISOString();
    sqliteOPFSInstance.saveVaultItem(found, password);
  }
  return sqliteOPFSInstance.getVaultItems(password);
}

/**
 * Restores a vault item from trash in SQLite.
 */
export function restoreFromTrash(id: string): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];

  const items = sqliteOPFSInstance.getVaultItems(password);
  const found = items.find(x => x.id === id);
  if (found) {
    found.deleted = false;
    delete found.deletedAt;
    sqliteOPFSInstance.saveVaultItem(found, password);
  }
  return sqliteOPFSInstance.getVaultItems(password);
}

/**
 * Permanently deletes a vault item from the database.
 */
export function deletePermanently(id: string): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.deletePermanently(id, password);
}

/**
 * Empties the trash completely in SQLite.
 */
export function emptyTrashComplete(): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];

  const items = sqliteOPFSInstance.getVaultItems(password);
  items.forEach(item => {
    if (item.deleted) {
      sqliteOPFSInstance.deletePermanently(item.id, password);
    }
  });
  return sqliteOPFSInstance.getVaultItems(password);
}

/**
 * Re-seeds the system with default demo items inside SQLite.
 */
export function reseedDemoData(): VaultItem[] {
  const password = getSessionMasterPassword();
  if (!password) return [];
  return sqliteOPFSInstance.reseedDemo(password, INITIAL_DEMO_ITEMS);
}
