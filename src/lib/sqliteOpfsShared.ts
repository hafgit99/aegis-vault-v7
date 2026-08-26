/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import { secureRandomBytes } from './random';
import { getDefaultKdfProfile, type Argon2idOptions } from './argon2id';
import type { WebCryptoAesGcmPayload } from './webcrypto';
import { isTestEnv } from './environment';
import type { VaultDatabaseRow } from './vaultDatabaseFormat';

/** Mask value written into plaintext-looking SQLite columns for encrypted rows. */
export const ENCRYPTED_MARKER = '[encrypted: aes-256-gcm]' as const;

export const VAULT_ITEM_KDF = 'argon2-browser' as const;

export const LEGACY_VAULT_ITEM_KDF_SALT = 'aegis_vault_v7_db_encryption_salt';

export const LEGACY_VAULT_ITEM_KDF_PARAMS = {
  memoryKiB: 32 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
};

export const NEW_VAULT_ITEM_KDF_PARAMS: Required<Argon2idOptions> = getDefaultKdfProfile();

/** Yields to the event loop outside of test environments (UI-freeze guard). */
export async function maybeDelay(ms: number): Promise<void> {
  if (isTestEnv) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createVaultEncryptionSalt(): string {
  return bytesToHex(secureRandomBytes(16));
}

/** Constant-time-ish byte array comparison used by the derived-key cache. */
export function areByteArraysEqual(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return result === 0;
}

export function sanitizeLogValue(value: string): string {
  return value.replace(/[\r\n\t]/g, ' ').replace(/["\\<>]/g, '_').slice(0, 120);
}

export function sanitizeQueryForLog(query: string): string {
  return query.replace(/[\r\n\t]/g, ' ').replace(/<script/gi, '&lt;script').slice(0, 1000);
}

export interface VaultItemRowInput {
  id: string;
  encrypted: WebCryptoAesGcmPayload;
  item: Pick<VaultItem, 'category' | 'favorite' | 'deleted' | 'notes' | 'username'> &
    Partial<Pick<VaultItem, 'deletedAt' | 'createdAt' | 'updatedAt'>>;
  createdAt: string;
  updatedAt: string;
  /** When true the decrypted username is kept in the row (demo reseed only). */
  exposeUsername?: boolean;
}

type VaultDatabaseRowCtor = VaultDatabaseRow;

/**
 * Builds a fully masked vault row: sensitive fields are replaced with the
 * encrypted marker and the ciphertext lives exclusively in `enc_metadata`.
 */
export function buildVaultItemRow(input: VaultItemRowInput): VaultDatabaseRowCtor {
  const { id, encrypted, item, createdAt, updatedAt } = input;
  return {
    id,
    title: ENCRYPTED_MARKER,
    category: item.category || 'login',
    favorite: item.favorite ? 1 : 0,
    deleted: item.deleted ? 1 : 0,
    deleted_at: item.deletedAt || null,
    created_at: createdAt,
    updated_at: updatedAt,
    username: input.exposeUsername ? item.username || '' : ENCRYPTED_MARKER,
    username_db: ENCRYPTED_MARKER,
    password_db: ENCRYPTED_MARKER,
    notes_db: item.notes ? ENCRYPTED_MARKER : '',
    enc_metadata: JSON.stringify(encrypted),
    enc_kdf: VAULT_ITEM_KDF,
  };
}
