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
  /**
   * P1-5: HMAC-SHA256 integrity tag over canonical state to detect row deletion, tampering, or argon_hash modifications.
   */
  integrityHmac?: string;
  /**
   * K-3: the `versionCounter` this integrity tag was computed over.
   *
   * Binding the counter into the signed payload means a tag can only ever
   * validate the exact state generation it was produced for. Combined with the
   * monotonicity check in `evaluateIntegrityState`, that closes the "laundering"
   * half of the finding: previously a tampered state only had to *fail* one
   * read before the very next write re-signed it with a fresh key, after which
   * the tampering was indistinguishable from a legitimate edit.
   *
   * `undefined` on states written before this field existed. Those are
   * re-signed on the first successful unlock, which is a legitimate
   * re-seal of a state whose integrity was already verified by the
   * `integrityHmac` comparison itself — not the same as signing unverified
   * state. See `evaluateIntegrityState` for how the two cases are told apart.
   */
  sealedAtVersionCounter?: number;
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
    sealedAtVersionCounter: typeof input.sealedAtVersionCounter === 'number'
      ? input.sealedAtVersionCounter
      : undefined,
  };
}

export function parseVaultDatabaseState(serialized: string): VersionedVaultDatabaseState {
  return normalizeVaultDatabaseState(JSON.parse(serialized));
}

/**
 * Computes a deterministic canonical string representation of the vault state
 * (excluding the integrityHmac itself) for HMAC hashing.
 *
 * K-3 / Y-4: `kdfParams` and `sealedAtVersionCounter` are part of the signed
 * payload. `kdfParams` was previously absent, which meant anyone able to write
 * to the database file could weaken the KDF to the enforced floor (8 MiB) while
 * the integrity system still reported the state as clean — a silent 4-8x drop
 * in brute-force cost with integrity checking active. `sealedAtVersionCounter`
 * binds the tag to the generation it was produced for.
 *
 * Both additions change the byte string, so an existing tag no longer matches.
 * That is intentional and safe: `evaluateIntegrityState` classifies a mismatch
 * caused by the missing `sealedAtVersionCounter` as a legitimate migration
 * (re-seal once), not as tampering. The HMAC `info` label is versioned so the
 * two domains can never be confused.
 */
export function computeCanonicalStateString(state: VersionedVaultDatabaseState): string {
  const sortedSecrets = [...state.user_secrets].sort((a, b) => a.username.localeCompare(b.username));
  const sortedItems = [...state.vault_items].sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    appId: state.appId,
    schemaVersion: state.schemaVersion,
    encryption_salt: state.encryption_salt || '',
    kdfParams: state.kdfParams
      ? {
        memoryKiB: state.kdfParams.memoryKiB,
        iterations: state.kdfParams.iterations,
        parallelism: state.kdfParams.parallelism,
        hashLength: state.kdfParams.hashLength,
      }
      : null,
    versionCounter: state.versionCounter ?? 1,
    sealedAtVersionCounter: state.sealedAtVersionCounter ?? 0,
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
  return signCanonical(computeCanonicalStateString(state), hmacKey);
}

async function signCanonical(canonical: string, hmacKey: Uint8Array): Promise<string> {
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
 *
 * Prefer `evaluateIntegrityState`, which also reports *why* a tag failed and
 * whether the state may be re-sealed. This boolean helper stays for callers
 * that only need the yes/no answer and never re-sign.
 */
export async function verifyStateIntegrityHmac(
  state: VersionedVaultDatabaseState,
  hmacKey: Uint8Array,
): Promise<boolean> {
  if (!state.integrityHmac) return false;
  const expectedHmac = await computeStateIntegrityHmac(state, hmacKey);
  return state.integrityHmac === expectedHmac;
}

// ---------------------------------------------------------------------------
// K-3: integrity evaluation and the re-seal rule
// ---------------------------------------------------------------------------

/**
 * The canonical string exactly as v1 produced it: no `kdfParams`, no
 * `sealedAtVersionCounter`. Kept so a state written by an older build can be
 * *verified* (and therefore safely re-sealed) instead of being either
 * distrusted forever or, far worse, treated as tampering.
 */
export function computeCanonicalStateStringV1(state: VersionedVaultDatabaseState): string {
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

async function deriveIntegrityKey(vaultEncryptionKey: Uint8Array, label: string): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey(
    'raw',
    vaultEncryptionKey,
    'HKDF',
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode(label),
    },
    ikm,
    256,
  );
  return new Uint8Array(derivedBits);
}

/** Current (v2) integrity key. The label version keeps the two domains disjoint. */
export function deriveVaultHmacKey(vaultEncryptionKey: Uint8Array): Promise<Uint8Array> {
  return deriveIntegrityKey(vaultEncryptionKey, 'aegis-vault-db-integrity-hmac-v2');
}

/** Legacy (v1) integrity key. Used only to verify pre-v2 states for migration. */
export function deriveVaultHmacKeyV1(vaultEncryptionKey: Uint8Array): Promise<Uint8Array> {
  return deriveIntegrityKey(vaultEncryptionKey, 'aegis-vault-db-integrity-hmac-v1');
}

/**
 * K-3: the outcome of checking a loaded state against its integrity tag.
 *
 * The distinction that carries the whole fix is `trusted` / `needs-reseal`
 * versus everything else. The finding was that a state which FAILED
 * verification was re-signed by the very next write, after which the tampering
 * became indistinguishable from a legitimate edit. Only `trusted` and
 * `needs-reseal` may ever be re-sealed.
 */
export type StateIntegrityVerdict =
  /** No tag at all, and none is required yet (vault not yet sealed). */
  | { status: 'unsigned' }
  /** Tag verified for this exact state generation. Safe to re-seal. */
  | { status: 'trusted' }
  /**
   * A pre-v2 state: written before `kdfParams` and `sealedAtVersionCounter`
   * entered the signed payload. Verified against the v1 scheme, so re-sealing
   * it is a format upgrade rather than a cover-up.
   */
  | { status: 'needs-reseal' }
  /**
   * The tag does not match under either scheme. Tampering, corruption, or an
   * `integrityHmac` that was blanked to skip the check. MUST NOT be re-signed.
   */
  | { status: 'tampered'; detail: string }
  /** A valid tag over an older `versionCounter` than this client has seen. */
  | { status: 'rolled-back'; loadedVersion: number; expectedMinVersion: number };

/**
 * Y-5: what this installation already knows about the vault, from evidence held
 * OUTSIDE the vault file (see `vaultIntegrityLedger`).
 */
export interface IntegrityExpectations {
  /**
   * The highest `versionCounter` ever sealed by this installation. A state
   * below it is a rollback.
   */
  minVersionCounter: number;
  /**
   * True once the vault has been sealed at least once. A tag is then MANDATORY,
   * which is what turns "someone blanked `integrityHmac`" from
   * indistinguishable into "tampered".
   */
  tagRequired: boolean;
}

/** No evidence recorded yet: used for a first run and for pre-ledger vaults. */
export const NO_INTEGRITY_EXPECTATIONS: IntegrityExpectations = {
  minVersionCounter: 0,
  tagRequired: false,
};

/**
 * K-3 / Y-5: decides whether a loaded state may be trusted and whether it may be
 * re-signed by the next write.
 *
 * `vaultEncryptionKey` (not a derived HMAC key) is taken so the legacy v1 key
 * can be derived here for the migration check.
 */
export async function evaluateIntegrityState(
  state: VersionedVaultDatabaseState,
  vaultEncryptionKey: Uint8Array,
  expectations: IntegrityExpectations = NO_INTEGRITY_EXPECTATIONS,
): Promise<StateIntegrityVerdict> {
  if (!state.integrityHmac) {
    // Y-5: once the ledger says this vault HAS been sealed, a missing tag is
    // no longer "nothing to protect" — it is the signature having been
    // removed, which is the cheapest possible way to make the next write seal
    // whatever is in the file. Before the ledger existed, blanking this field
    // was completely silent.
    if (expectations.tagRequired) {
      return {
        status: 'tampered',
        detail: 'integrity tag is missing but this vault has been sealed before (Y-5: tag blanking)',
      };
    }
    // Genuinely unsealed (a fresh vault, or a pre-ledger one): there is no
    // prior signature to contradict, so re-signing cannot launder anything.
    return { status: 'unsigned' };
  }

  const loadedVersion = state.versionCounter ?? 1;

  // Monotonicity is checked BEFORE the tag comparison so a rollback is reported
  // as a rollback rather than as a generic tag mismatch. The floor now comes
  // from the on-disk ledger, so it survives an app restart — previously it was
  // module state and any restart reset it to zero, making "replay an old file,
  // restart" a complete bypass.
  if (expectations.minVersionCounter > 0 && loadedVersion < expectations.minVersionCounter) {
    return { status: 'rolled-back', loadedVersion, expectedMinVersion: expectations.minVersionCounter };
  }

  // The sealed generation must be the current one. A state whose
  // `sealedAtVersionCounter` trails its own `versionCounter` was bumped after
  // sealing, which no legitimate write path does.
  if (state.sealedAtVersionCounter !== undefined
    && state.sealedAtVersionCounter !== loadedVersion) {
    return {
      status: 'tampered',
      detail: `sealedAtVersionCounter (${state.sealedAtVersionCounter}) does not match versionCounter (${loadedVersion})`,
    };
  }

  const hmacKeyV2 = await deriveVaultHmacKey(vaultEncryptionKey);
  if (state.integrityHmac === await signCanonical(computeCanonicalStateString(state), hmacKeyV2)) {
    return { status: 'trusted' };
  }

  // Pre-v2 state: it carries no `sealedAtVersionCounter`, and its tag verifies
  // under the v1 key over the v1 canonical string. That combination cannot be
  // produced by editing a v2 state, so accepting it is safe.
  if (state.sealedAtVersionCounter === undefined) {
    const hmacKeyV1 = await deriveVaultHmacKeyV1(vaultEncryptionKey);
    const legacyTag = await signCanonical(computeCanonicalStateStringV1(state), hmacKeyV1);
    if (state.integrityHmac === legacyTag) {
      return { status: 'needs-reseal' };
    }
  }

  return { status: 'tampered', detail: 'integrity tag does not match canonical state' };
}

/**
 * K-3: whether a verdict permits (re-)signing the state.
 *
 * This is the rule the finding was about. Everything that is not explicitly
 * trustworthy must fail the write rather than be laundered into a fresh,
 * valid-looking signature.
 */
export function mayReSignState(verdict: StateIntegrityVerdict): boolean {
  return verdict.status === 'trusted' || verdict.status === 'needs-reseal' || verdict.status === 'unsigned';
}