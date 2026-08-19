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
});
