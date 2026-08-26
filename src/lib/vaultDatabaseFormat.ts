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
  /** P1-5: Monotonically increasing version counter to detect rollback attacks. */
  versionCounter?: number;
  /** P1-5: HMAC-SHA256 integrity tag over canonical state to detect row deletion, tampering, or argon_hash modifications. */
  integrityHmac?: string;
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
    versionCounter: 1,
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
  const kdfObj = rawKdfParams && typeof rawKdfParams === 'object' ? (rawKdfParams as Record<string, unknown>) : null;
  const kdfParams = kdfObj ? {
    memoryKiB: typeof kdfObj.memoryKiB === 'number' ? kdfObj.memoryKiB : 32 * 1024,
    iterations: typeof kdfObj.iterations === 'number' ? kdfObj.iterations : 3,
    parallelism: typeof kdfObj.parallelism === 'number' ? kdfObj.parallelism : 1,
    hashLength: typeof kdfObj.hashLength === 'number' ? kdfObj.hashLength : 32,
  } : undefined;

  return {
    schemaVersion: CURRENT_VAULT_DB_SCHEMA_VERSION,
    appId: input.appId || VAULT_DB_APP_ID,
    migratedFrom: sourceVersion < CURRENT_VAULT_DB_SCHEMA_VERSION ? sourceVersion : input.migratedFrom,
    encryption_salt: typeof input.encryption_salt === 'string' ? input.encryption_salt : undefined,
    kdfParams,
    user_secrets: arrayOrEmpty<VaultDatabaseUserSecret>(input.user_secrets),
    vault_items: arrayOrEmpty<VaultDatabaseRow>(input.vault_items),
    versionCounter: typeof input.versionCounter === 'number' ? input.versionCounter : 1,
    integrityHmac: typeof input.integrityHmac === 'string' ? input.integrityHmac : undefined,
  };
}

export function parseVaultDatabaseState(serialized: string): VersionedVaultDatabaseState {
  return normalizeVaultDatabaseState(JSON.parse(serialized));
}

/**
 * Computes a deterministic canonical string representation of the vault state
 * (excluding the integrityHmac itself) for HMAC hashing.
 */
export function computeCanonicalStateString(state: VersionedVaultDatabaseState): string {
  const sortedSecrets = [...state.user_secrets].sort((a, b) => a.username.localeCompare(b.username));
  const sortedItems = [...state.vault_items].sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    appId: state.appId,
    schemaVersion: state.schemaVersion,
    encryption_salt: state.encryption_salt || '',
    versionCounter: state.versionCounter ?? 1,
    user_secrets: sortedSecrets.map((s) => ({ u: s.username, h: s.argon_hash })),
    vault_items: sortedItems.map((i) => ({
      id: i.id,
      t: i.title,
      c: i.category,
      f: i.favorite,
      d: i.deleted,
      da: i.deleted_at,
      u: i.username,
      udb: i.username_db,
      pdb: i.password_db,
      ndb: i.notes_db,
      em: i.enc_metadata,
      kdf: i.enc_kdf || '',
    })),
  });
}

/**
 * Computes an HMAC-SHA256 tag over the canonical state using an authentication key.
 */
export async function computeStateIntegrityHmac(
  state: VersionedVaultDatabaseState,
  hmacKey: Uint8Array,
): Promise<string> {
  const canonical = computeCanonicalStateString(state);
  const data = new TextEncoder().encode(canonical);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    hmacKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Verifies that the state's integrityHmac matches the calculated HMAC over canonical state.
 */
export async function verifyStateIntegrityHmac(
  state: VersionedVaultDatabaseState,
  hmacKey: Uint8Array,
): Promise<boolean> {
  if (!state.integrityHmac) return false;
  const expectedHmac = await computeStateIntegrityHmac(state, hmacKey);
  return state.integrityHmac === expectedHmac;
}
