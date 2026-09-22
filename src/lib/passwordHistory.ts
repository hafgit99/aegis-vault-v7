/**
 * @file passwordHistory.ts
 * @description Manages historical passwords for vault login items.
 * Free tier keeps the last 3 passwords; entries are stored directly inside the
 * zero-knowledge encrypted VaultItem record.
 *
 * @license Apache-2.0
 */

import type { PasswordHistoryEntry, VaultItem } from '../types';

export const MAX_FREE_PASSWORD_HISTORY = 3;

/**
 * Appends the previous password to history when a password is changed.
 * Caps the history length to MAX_FREE_PASSWORD_HISTORY (3).
 * If the old password matches the new password or is empty, history remains unchanged.
 */
export function recordPasswordHistory(
  existingHistory: PasswordHistoryEntry[] | undefined,
  oldPassword: string | undefined,
  newPassword: string | undefined,
  changedAt: string = new Date().toISOString(),
): PasswordHistoryEntry[] {
  if (!oldPassword || !oldPassword.trim()) {
    return existingHistory ? [...existingHistory] : [];
  }

  if (oldPassword === newPassword) {
    return existingHistory ? [...existingHistory] : [];
  }

  const current = existingHistory ? [...existingHistory] : [];

  // Filter out any identical older entry to keep history clean and meaningful
  const filtered = current.filter((entry) => entry.password !== oldPassword);

  const updated: PasswordHistoryEntry[] = [
    {
      password: oldPassword,
      changedAt,
    },
    ...filtered,
  ];

  return updated.slice(0, MAX_FREE_PASSWORD_HISTORY);
}

/**
 * Returns the password history for an item, sorted newest to oldest.
 */
export function getPasswordHistory(item: VaultItem): PasswordHistoryEntry[] {
  if (!item.passwordHistory || !Array.isArray(item.passwordHistory)) {
    return [];
  }
  return [...item.passwordHistory].slice(0, MAX_FREE_PASSWORD_HISTORY);
}

/**
 * Clears password history for an item.
 */
export function clearPasswordHistory(item: VaultItem): VaultItem {
  return {
    ...item,
    passwordHistory: [],
  };
}
