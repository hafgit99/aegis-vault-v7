export const CURRENT_VAULT_DB_SCHEMA_VERSION = 3;
export const VAULT_DB_APP_ID = 'aegis-vault-v7';

export interface VaultDatabaseUserSecret {
  username: string;
  argon_hash: string;
}

export interface VaultDatabaseRow {
  id: string;
  title: string;
  category: string;
  favorite: number;
  deleted: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  username: string;
  username_db: string;
  password_db: string;
  notes_db: string;
  enc_metadata: string;
  enc_kdf?: 'argon2-browser' | 'legacy-simulated-argon2id';
}

export interface VersionedVaultDatabaseState {
  schemaVersion: number;
  appId: string;
  migratedFrom?: number;
  encryption_salt?: string;
  kdfParams?: {
    memoryKiB: number;
    iterations: number;
    parallelism: number;
    hashLength: number;
  };
  user_secrets: VaultDatabaseUserSecret[];
  vault_items: VaultDatabaseRow[];
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function createEmptyVaultDatabaseState(): VersionedVaultDatabaseState {
  return {
    schemaVersion: CURRENT_VAULT_DB_SCHEMA_VERSION,
    appId: VAULT_DB_APP_ID,
    encryption_salt: undefined,
    user_secrets: [],
    vault_items: [],
  };
}

export function normalizeVaultDatabaseState(raw: unknown): VersionedVaultDatabaseState {
  if (!raw || typeof raw !== 'object') {
    return createEmptyVaultDatabaseState();
  }

  const input = raw as Partial<VersionedVaultDatabaseState> & { version?: number };
  const sourceVersion = typeof input.schemaVersion === 'number'
    ? input.schemaVersion
    : typeof input.version === 'number'
      ? input.version
      : 1;

  const rawKdfParams = input.kdfParams;
  // Default to the cross-platform safe KDF profile (32 MiB / 3 iterations)
  // so the bundled argon2-browser WASM can always satisfy the allocation
  // in WebView2 (Windows), WebKit (macOS/iOS), WebKitGTK (Linux) and Android
  // WebView. The 128 MiB default previously crashed on constrained WebView2
  // builds with "memory access out of bounds" during unlock and import.
  const kdfParams = rawKdfParams && typeof rawKdfParams === 'object' ? {
    memoryKiB: typeof (rawKdfParams as any).memoryKiB === 'number' ? (rawKdfParams as any).memoryKiB : 32 * 1024,
    iterations: typeof (rawKdfParams as any).iterations === 'number' ? (rawKdfParams as any).iterations : 3,
    parallelism: typeof (rawKdfParams as any).parallelism === 'number' ? (rawKdfParams as any).parallelism : 1,
    hashLength: typeof (rawKdfParams as any).hashLength === 'number' ? (rawKdfParams as any).hashLength : 32,
  } : undefined;

  return {
    schemaVersion: CURRENT_VAULT_DB_SCHEMA_VERSION,
    appId: input.appId || VAULT_DB_APP_ID,
    migratedFrom: sourceVersion < CURRENT_VAULT_DB_SCHEMA_VERSION ? sourceVersion : input.migratedFrom,
    encryption_salt: typeof input.encryption_salt === 'string' ? input.encryption_salt : undefined,
    kdfParams,
    user_secrets: arrayOrEmpty<VaultDatabaseUserSecret>(input.user_secrets),
    vault_items: arrayOrEmpty<VaultDatabaseRow>(input.vault_items),
  };
}

export function parseVaultDatabaseState(serialized: string): VersionedVaultDatabaseState {
  return normalizeVaultDatabaseState(JSON.parse(serialized));
}
