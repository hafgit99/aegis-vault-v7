import { describe, expect, it } from 'vitest';

import {
  CURRENT_VAULT_DB_SCHEMA_VERSION,
  VAULT_DB_APP_ID,
  createEmptyVaultDatabaseState,
  normalizeVaultDatabaseState,
  parseVaultDatabaseState,
} from './vaultDatabaseFormat';

describe('vault database format migrations', () => {
  it('creates an empty versioned database state', () => {
    expect(createEmptyVaultDatabaseState()).toEqual({
      schemaVersion: CURRENT_VAULT_DB_SCHEMA_VERSION,
      appId: VAULT_DB_APP_ID,
      user_secrets: [],
      vault_items: [],
    });
  });

  it('migrates an unversioned fallback database payload to the current schema', () => {
    const migrated = normalizeVaultDatabaseState({
      user_secrets: [{ username: 'owner', argon_hash: 'hash' }],
      vault_items: [
        {
          id: 'item-1',
          title: 'GitHub',
          category: 'login',
          favorite: 1,
          deleted: 0,
          deleted_at: null,
          created_at: '2026-06-10',
          updated_at: '2026-06-10',
          username: 'octo',
          username_db: '[encrypted: aes-256-gcm]',
          password_db: '[encrypted: aes-256-gcm]',
          notes_db: '',
          enc_metadata: '{}',
          enc_kdf: 'argon2-browser',
        },
      ],
    });

    expect(migrated.schemaVersion).toBe(CURRENT_VAULT_DB_SCHEMA_VERSION);
    expect(migrated.appId).toBe(VAULT_DB_APP_ID);
    expect(migrated.migratedFrom).toBe(1);
    expect(migrated.user_secrets).toHaveLength(1);
    expect(migrated.vault_items).toHaveLength(1);
    expect(migrated.vault_items[0]!.enc_kdf).toBe('argon2-browser');
  });

  it('preserves current versioned database arrays when parsing serialized state', () => {
    const parsed = parseVaultDatabaseState(JSON.stringify({
      schemaVersion: CURRENT_VAULT_DB_SCHEMA_VERSION,
      appId: VAULT_DB_APP_ID,
      user_secrets: [],
      vault_items: [],
    }));

    expect(parsed).toEqual({
      schemaVersion: CURRENT_VAULT_DB_SCHEMA_VERSION,
      appId: VAULT_DB_APP_ID,
      user_secrets: [],
      vault_items: [],
    });
  });

  it('returns empty state for null, undefined, and non-object inputs', () => {
    expect(normalizeVaultDatabaseState(null).vault_items).toEqual([]);
    expect(normalizeVaultDatabaseState(undefined).vault_items).toEqual([]);
    expect(normalizeVaultDatabaseState('not-an-object').vault_items).toEqual([]);
  });

  it('uses version field when schemaVersion is absent', () => {
    const result = normalizeVaultDatabaseState({ version: 2 });
    expect(result.migratedFrom).toBe(2);
  });

  it('normalizes kdfParams with partial or missing fields', () => {
    const result = normalizeVaultDatabaseState({
      kdfParams: { memoryKiB: 16384 },
    });
    expect(result.kdfParams).toEqual({
      memoryKiB: 16384,
      iterations: 3,
      parallelism: 1,
      hashLength: 32,
    });
  });

  it('preserves encryption_salt when present as a string', () => {
    const result = normalizeVaultDatabaseState({
      encryption_salt: 'abc123',
    });
    expect(result.encryption_salt).toBe('abc123');

    const noSalt = normalizeVaultDatabaseState({ encryption_salt: 42 });
    expect(noSalt.encryption_salt).toBeUndefined();
  });

  it('does not set migratedFrom when schemaVersion matches current', () => {
    const result = normalizeVaultDatabaseState({
      schemaVersion: CURRENT_VAULT_DB_SCHEMA_VERSION,
      migratedFrom: 1,
    });
    expect(result.migratedFrom).toBe(1);
  });
});
