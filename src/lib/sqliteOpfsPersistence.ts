/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Persistence layer for the simulated SQLite vault database.
 *
 * Storage precedence:
 *   1. Desktop native app-data (via Tauri IPC).
 *   2. Browser OPFS sandbox file (secondary mirror / browser-only mode).
 *   3. IndexedDB local fallback mirror (recovery path).
 *
 * This module owns the storage primitives; the SQLiteOPFS repository class
 * orchestrates them and keeps ownership of the in-memory state.
 */

import {
  getNativeVaultStorageScope,
  readDesktopVaultDatabase,
  writeDesktopVaultDatabase,
} from './desktopStorage';
import { didLocalMirrorWriteFail, setIndexedDbItemSync } from './indexedDbStorage';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import { parseVaultDatabaseState, type VersionedVaultDatabaseState } from './vaultDatabaseFormat';
import { isTestEnv } from './environment';
import { isArgon2WriteBlocked } from './argon2id';
import { readVaultIntegrityLedger } from './vaultIntegrityLedger';

export const DB_FILENAME = 'kalderashield.db';
export const LOCAL_FALLBACK_KEY = 'kalderashield_fallback';

/**
 * O-2: bookkeeping for the localStorage mirror, kept in its own tiny key.
 *
 * The report's suggested fix was "record the mirror's write date and warn when
 * it is older than the OPFS copy". A timestamp is the weaker signal and this
 * uses `versionCounter` instead, which the vault already maintains as a
 * monotonically increasing number and which Y-5 already trusts for rollback
 * detection. It answers the question directly -- "does the mirror hold an older
 * version of the vault than the one we last managed to persist?" -- with no
 * clock involved, so it cannot be wrong because of skew or because a write
 * happened to land inside the same millisecond.
 *
 * `writtenAtMs` is still recorded, but only so the warning can tell the user
 * how old the mirror is, not to decide whether it is stale.
 */
export const LOCAL_FALLBACK_META_KEY = 'kalderashield_fallback_meta';

export interface LocalFallbackMirrorMeta {
  /** The vault `versionCounter` this mirror was meant to hold. */
  version: number;
  /** When the mirror was last written, in epoch milliseconds. */
  writtenAtMs: number;
}

function readFallbackMeta(): LocalFallbackMirrorMeta | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalFallbackMirrorMeta>;
    if (typeof parsed.version !== 'number' || !Number.isFinite(parsed.version)) return null;
    return {
      version: parsed.version,
      writtenAtMs: typeof parsed.writtenAtMs === 'number' ? parsed.writtenAtMs : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Records the version the mirror is *about* to hold.
 *
 * If this write fails, so does the payload write that follows it — the mirror is
 * megabytes and this is tens of bytes — so the mirror cannot be further behind
 * than it already was, and the next successful write re-establishes the record.
 * That is why a failed record is not treated as a failure signal in its own
 * right.
 */
function writeFallbackMeta(version: number): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      LOCAL_FALLBACK_META_KEY,
      JSON.stringify({ version, writtenAtMs: Date.now() } satisfies LocalFallbackMirrorMeta),
    );
  } catch {
    // If even this tiny write fails, quota is exhausted to the last byte. The
    // mirror is then also unwriteable, so it cannot be further behind than it
    // already was, and the next successful write re-establishes the record.
  }
}

/** Why a mirror was found to be behind the authoritative copy. */
export type FallbackMirrorStaleReason = 'write-failed' | 'version-behind';

export interface FallbackMirrorStatus {
  present: boolean;
  stale: boolean;
  reason?: FallbackMirrorStaleReason;
  /** The vault version the mirror holds, when it could be read. */
  version?: number;
  /** The vault version the mirror was meant to hold. */
  expectedVersion?: number;
  writtenAtMs?: number;
}

/**
 * Inspects the mirror without loading it as vault data.
 *
 * The version comparison is the reliable half and works whether or not the quota
 * ever bit. The `write-failed` half is remembered in memory only: a quota-
 * exhausted origin cannot be relied on to accept the marker, so it is a
 * best-effort signal layered on top rather than the foundation.
 */
export function inspectLocalFallbackMirror(): FallbackMirrorStatus {
  if (typeof localStorage === 'undefined') return { present: false, stale: false };

  const meta = readFallbackMeta();
  let version: number | undefined;
  try {
    const raw = localStorage.getItem(LOCAL_FALLBACK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { versionCounter?: unknown };
      if (typeof parsed.versionCounter === 'number' && Number.isFinite(parsed.versionCounter)) {
        version = parsed.versionCounter;
      }
    }
  } catch {
    // An unparseable mirror is not stale, it is unreadable, and the load path
    // already handles that case separately. Do not conflate the two.
  }

  if (version !== undefined && meta && version < meta.version) {
    return {
      present: true,
      stale: true,
      reason: 'version-behind',
      version,
      expectedVersion: meta.version,
      writtenAtMs: meta.writtenAtMs,
    };
  }

  if (didLocalMirrorWriteFail(LOCAL_FALLBACK_KEY)) {
    return {
      present: version !== undefined || meta !== null,
      stale: true,
      reason: 'write-failed',
      version,
      expectedVersion: meta?.version,
      writtenAtMs: meta?.writtenAtMs,
    };
  }

  return {
    present: version !== undefined || meta !== null,
    stale: false,
    version,
    expectedVersion: meta?.version,
    writtenAtMs: meta?.writtenAtMs,
  };
}

/** O-2: set when a stale mirror was actually used; consumed once by the UI alert hook. */
let vaultFallbackMirrorStale = false;

export function consumeVaultFallbackMirrorStale(): boolean {
  const detected = vaultFallbackMirrorStale;
  vaultFallbackMirrorStale = false;
  return detected;
}

/**
 * Records that a stale mirror was used and announces it.
 *
 * Called from the load path rather than from the write path on purpose: a
 * swallowed write is only something the user needs to hear about if the stale
 * mirror is then actually used to recover their data. Warning on every quota
 * hiccup during normal saving would train them to ignore it.
 */
export function markVaultFallbackMirrorStale(reason: FallbackMirrorStaleReason): void {
  vaultFallbackMirrorStale = true;
  logSecurityEvent(
    securityEventCodes.storageLocalFallbackStale,
    'The localStorage vault mirror is out of date and was used to recover data.',
    'warning',
    { reason },
  );
}

/**
 * Announces, if it applies, that the mirror being used to recover data is behind
 * the authoritative copy.
 *
 * Wrapped in its own `try`/`catch` on purpose. This runs on the load path, and
 * an earlier version of it sat inside the `try` that guards the mirror JSON
 * parse -- where a failure was swallowed by `catch {}` and the mirror was then
 * never loaded at all. Reporting a condition must never be able to change what
 * happens to the user's vault.
 */
export function reportFallbackMirrorRecovery(): void {
  try {
    const mirror = inspectLocalFallbackMirror();
    if (!mirror.stale) return;
    logSecurityEvent(
      securityEventCodes.storageLocalFallbackStale,
      'Loaded vault state from a local fallback mirror that is out of date.',
      'warning',
      {
        reason: mirror.reason,
        mirrorVersion: mirror.version,
        expectedVersion: mirror.expectedVersion,
        writtenAtMs: mirror.writtenAtMs,
      },
    );
    markVaultFallbackMirrorStale(mirror.reason ?? 'version-behind');
  } catch {
    // Swallowed deliberately, see above.
  }
}

/** Marker JSON stored in the fallback mirror when the desktop app owns persistence. */
export function createDesktopManagedSetupMarker(state: VersionedVaultDatabaseState): string {
  return JSON.stringify({
    schemaVersion: state.schemaVersion,
    appId: state.appId,
    desktopManaged: true,
    user_secrets: state.user_secrets.length > 0
      ? [{ username: 'owner', argon_hash: '[stored-in-desktop-app-data]' }]
      : [],
    vault_items: [],
  }, null, 2);
}

export function writeLocalFallbackMirror(
  state: VersionedVaultDatabaseState,
  payloadStr: string,
  savedToDesktop: boolean,
): void {
  // O-2: record the version this mirror is about to hold.
  //
  // The record is written *first*, and the honest reason is narrow: if the
  // process dies between the two writes, meta-first leaves the record ahead of
  // the payload, which over-reports staleness - a spurious warning the user can
  // dismiss - whereas meta-last leaves both at the old version, which
  // under-reports and is the failure this finding is about. Fail-closed.
  //
  // It is worth being precise about what this ordering does *not* buy, because
  // the obvious claim is wrong: if the payload write is swallowed on quota while
  // the record write succeeds, the mismatch is detected either way. I verified
  // that by moving this line after the write and re-running the suite - the
  // tests still passed. So the ordering is not what defeats the quota case; the
  // record existing at all is.
  writeFallbackMeta(state.versionCounter ?? 1);
  setIndexedDbItemSync(
    LOCAL_FALLBACK_KEY,
    savedToDesktop ? createDesktopManagedSetupMarker(state) : payloadStr,
  );
}

export type PersistedLoadResult =
  | { kind: 'state'; state: VersionedVaultDatabaseState; logLabel: string; resaveAfterLoad: boolean }
  /** OPFS is available but no vault file exists yet — caller should run legacy migration. */
  | { kind: 'missing' }
  /** Empty OPFS file existed — nothing to load, nothing to migrate. */
  | { kind: 'empty' }
  /** Neither desktop storage nor OPFS is available — caller should run legacy migration. */
  | { kind: 'unavailable' }
  /**
   * K-4: a vault file EXISTS but could not be decoded — oversized, truncated,
   * not valid UTF-8, or not valid JSON.
   *
   * This is deliberately distinct from `unavailable`. `unavailable` means "this
   * storage path does not exist here", and the correct response is to fall back
   * to the IndexedDB mirror. `unreadable` means "the authoritative vault is
   * present and damaged", and falling back would hand the user a STALE mirror
   * that then overwrites the real vault on their next save — silent,
   * irreversible data loss. The caller must treat it as a hard startup error
   * and offer snapshot restore instead.
   */
  | { kind: 'unreadable'; reason: UnreadableVaultReason; detail: string };

/** Why an existing vault file could not be decoded. */
export type UnreadableVaultReason =
  /** File exceeds the maximum accepted vault size. */
  | 'too-large'
  /** `read_to_string` rejected the bytes (invalid UTF-8). */
  | 'invalid-encoding'
  /** The file was empty or whitespace-only where content was expected. */
  | 'empty'
  /** The bytes are not valid JSON. */
  | 'invalid-json'
  /** JSON parsed but is not a usable vault state. */
  | 'invalid-shape'
  /** The file handle or read operation failed outright. */
  | 'read-failed';

let lastObservedVersionCounter = 0;

export function getLastObservedVersionCounter(): number {
  return lastObservedVersionCounter;
}

export function setLastObservedVersionCounter(val: number): void {
  lastObservedVersionCounter = val;
}

/** N-1: set when a vault database rollback is detected; consumed once by the UI alert hook. */
let vaultRollbackDetected = false;

export function consumeVaultRollbackDetected(): boolean {
  const detected = vaultRollbackDetected;
  vaultRollbackDetected = false;
  return detected;
}

/**
 * Y-15: the durable high-water mark for the vault `versionCounter`.
 *
 * Y-5 put a persistent `highestVersionCounter` in `vaultIntegrityLedger`, and the
 * *write* path already merged it with the in-session counter
 * (`readIntegrityExpectations` in `sqlite_opfs.ts`). The *load* path did not: it
 * consulted only the module-global `lastObservedVersionCounter`, which is `0` on
 * a fresh page load. Its `lastObservedVersionCounter > 0` guard therefore never
 * fired outside a test, so:
 *
 *   - `vaultRollbackDetected` was never set in production, which made
 *     `useVaultRollbackAlert` dead code — the user was never told;
 *   - the only symptom of a rolled-back vault was an opaque
 *     `vault-database-integrity-rolled-back` throw on the user's next save.
 *
 * Both the detection and the write gate must reason about the same mark, or the
 * alert can never agree with the gate.
 */
function readDurableHighWaterMark(): number {
  const ledgerMark = readVaultIntegrityLedger()?.highestVersionCounter ?? 0;
  return Math.max(ledgerMark, lastObservedVersionCounter);
}

function processLoadedStateIntegrity(state: VersionedVaultDatabaseState): boolean {
  if (typeof state.versionCounter === 'number') {
    const highWaterMark = readDurableHighWaterMark();
    if (highWaterMark > 0 && state.versionCounter < highWaterMark) {
      vaultRollbackDetected = true;
      logSecurityEvent(
        securityEventCodes.storageLegacyMigrationFailed,
        `Vault database rollback detected! Loaded versionCounter (${state.versionCounter}) is lower than last observed (${highWaterMark}).`,
        'critical',
        { loadedVersion: state.versionCounter, expectedMinVersion: highWaterMark },
      );
      return true;
    }
    lastObservedVersionCounter = Math.max(highWaterMark, state.versionCounter);
  }
  return false;
}

/**
 * Largest vault payload this module will attempt to decode.
 *
 * Mirrors the native-side `MAX_VAULT_FILE_BYTES` limit that
 * `write_vault_database_file` / `read_vault_database_file` enforce in Rust
 * (`src-tauri/src/lib.rs`). Keeping both ends identical is what turns "the file
 * exists but is over the limit" into a reportable condition instead of an
 * opaque read error that used to be indistinguishable from "no file".
 */
export const MAX_VAULT_PAYLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Result of decoding a serialized vault payload, before the caller attaches the
 * source-specific log label.
 */
export type PayloadDecodeResult =
  | { kind: 'state'; state: VersionedVaultDatabaseState }
  | { kind: 'unreadable'; reason: UnreadableVaultReason; detail: string };

/**
 * Decodes a serialized vault payload, classifying every failure mode instead of
 * letting `JSON.parse` throw an anonymous `SyntaxError` that callers cannot act
 * on. K-4: the previous bare `JSON.parse` meant a corrupted file was
 * indistinguishable from an absent one at the call site.
 */
export function decodePersistedVaultPayload(
  payload: string,
  byteLength: number,
): PayloadDecodeResult {
  if (byteLength > MAX_VAULT_PAYLOAD_BYTES) {
    return {
      kind: 'unreadable',
      reason: 'too-large',
      detail: `${byteLength} bytes exceeds the ${MAX_VAULT_PAYLOAD_BYTES} byte limit`,
    };
  }

  if (!payload.trim()) {
    return { kind: 'unreadable', reason: 'empty', detail: 'vault payload contained no data' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    return {
      kind: 'unreadable',
      reason: 'invalid-json',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      kind: 'unreadable',
      reason: 'invalid-shape',
      detail: `expected a JSON object, received ${Array.isArray(parsed) ? 'array' : typeof parsed}`,
    };
  }

  return { kind: 'state', state: parseVaultDatabaseState(payload) };
}

function logUnreadableVault(reason: UnreadableVaultReason, detail: string): void {
  logSecurityEvent(
    securityEventCodes.storageDesktopReadFailed,
    `Vault database file is present but unreadable (${reason}). Refusing to fall back to the stale IndexedDB mirror.`,
    'critical',
    { reason, detail },
  );
}

/**
 * Reads the vault database from desktop app-data or the OPFS mirror.
 *
 * K-4: no longer throws and no longer collapses "damaged" into "absent". A
 * damaged authoritative file returns `{ kind: 'unreadable' }` so the caller can
 * block startup and offer snapshot restore; only a genuinely absent storage
 * path returns `unavailable`, which is the case where the mirror fallback is
 * safe.
 */
export async function loadPersistedVaultDatabase(): Promise<PersistedLoadResult> {
  let desktopPayload: string | null = null;
  try {
    desktopPayload = await readDesktopVaultDatabase();
  } catch (err) {
    logSecurityEvent(
      securityEventCodes.storageDesktopReadFailed,
      'Persistent desktop storage could not be loaded; trying local fallback.',
      'warning',
      { error: err instanceof Error ? err.message : String(err) },
    );
    return { kind: 'unavailable' };
  }

  if (desktopPayload) {
    const decoded = decodePersistedVaultPayload(
      desktopPayload,
      new TextEncoder().encode(desktopPayload).byteLength,
    );
    if (decoded.kind === 'state') {
      const state = decoded.state;
      processLoadedStateIntegrity(state);
      setIndexedDbItemSync(LOCAL_FALLBACK_KEY, createDesktopManagedSetupMarker(state));
      return {
        kind: 'state',
        state,
        logLabel: `sqlite3_open("${getNativeVaultStorageScope()}:///${DB_FILENAME}")`,
        resaveAfterLoad: false,
      };
    }
    logUnreadableVault(decoded.reason, decoded.detail);
    return { kind: 'unreadable', reason: decoded.reason, detail: decoded.detail };
  }

  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
    let root: FileSystemDirectoryHandle;
    try {
      root = await navigator.storage.getDirectory();
    } catch (err) {
      logSecurityEvent(
        securityEventCodes.storageDesktopReadFailed,
        'OPFS root directory is not accessible; trying local fallback.',
        'warning',
        { error: err instanceof Error ? err.message : String(err) },
      );
      return { kind: 'unavailable' };
    }

    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await root.getFileHandle(DB_FILENAME);
    } catch {
      // File does not exist yet. Initialize using localStorage backup or start fresh.
      return { kind: 'missing' };
    }

    let file: File;
    let content: string;
    try {
      file = await fileHandle.getFile();
      content = await file.text();
    } catch (err) {
      // K-4: the file exists but cannot be read at all (I/O error, revoked
      // handle, undecodable bytes). Falling back to the mirror here is what
      // let a later save overwrite the real vault.
      const detail = err instanceof Error ? err.message : String(err);
      logUnreadableVault('read-failed', detail);
      return { kind: 'unreadable', reason: 'read-failed', detail };
    }

    if (!content) {
      // A genuinely empty file is the "fresh install" case, not corruption:
      // `createWritable` truncates before the first payload lands, so an
      // interrupted very first write can legitimately leave 0 bytes. A missing
      // or non-numeric `size` is treated the same way rather than being
      // escalated to corruption on the strength of an absent property.
      const reportedSize = typeof file.size === 'number' && Number.isFinite(file.size) ? file.size : 0;
      return reportedSize === 0
        ? { kind: 'empty' }
        : { kind: 'unreadable', reason: 'empty', detail: 'vault file exists but holds no decodable content' };
    }

    const decoded = decodePersistedVaultPayload(content, file.size);
    if (decoded.kind === 'state') {
      const state = decoded.state;
      processLoadedStateIntegrity(state);
      return {
        kind: 'state',
        state,
        logLabel: `sqlite3_open("opfs:///${DB_FILENAME}")`,
        resaveAfterLoad: true,
      };
    }

    logUnreadableVault(decoded.reason, decoded.detail);
    return { kind: 'unreadable', reason: decoded.reason, detail: decoded.detail };
  }

  // Fallback to standard sandbox-compliant simulated OPFS persistence.
  return { kind: 'unavailable' };
}

/**
 * Writes the payload string to the sandboxed OPFS file standard in the background.
 * Uses Promise.race to enforce a timeout in case file locks are held by old sessions (hot-reloads).
 *
 * K-5: throws on every real failure (unsupported createWritable, write error,
 * timeout) instead of logging-and-resolving — callers decide what "nothing
 * was written" means for their persistence path.
 */
async function writeToOPFSWithTimeout(payloadStr: string, timeoutMs: number): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
    // No OPFS API at all: treated as a benign skip (desktop/test environments
    // where another persistence path is authoritative).
    return;
  }

  const opfsWritePromise = (async () => {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });

    // K-5: a missing createWritable must fail loudly — silently resolving
    // here made every save a no-op that still reported success.
    if (!('createWritable' in fileHandle)) {
      throw new Error('OPFS createWritable is not supported in this environment');
    }
    const writable = await (fileHandle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
    try {
      await writable.write(payloadStr);
      await writable.close();
    } catch (err) {
      // O-23: abort on failure so the exclusive lock does not leak and
      // poison every subsequent createWritable() for this page.
      try {
        await writable.abort();
      } catch {
        /* best effort — the original failure is what matters */
      }
      throw err;
    }
  })();

  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<void>((_, reject) => {
    timeoutTimer = setTimeout(() => reject(new Error('OPFS write timed out (lock leak suspected)')), timeoutMs);
  });

  try {
    await Promise.race([opfsWritePromise, timeoutPromise]);
  } catch (err) {
    clearTimeout(timeoutTimer ?? undefined);
    logSecurityEvent(
      securityEventCodes.storageDesktopWriteFailed,
      'OPFS mirror write failed or timed out.',
      'critical',
      { error: err instanceof Error ? err.message : String(err) },
    );
    throw err;
  } finally {
    clearTimeout(timeoutTimer ?? undefined);
  }
}

/**
 * Saves raw DB state: desktop app-data first, IndexedDB mirror second,
 * OPFS file third (awaited in tests / when desktop storage is unavailable).
 */
export async function persistVaultDatabase(state: VersionedVaultDatabaseState): Promise<boolean> {
  // P1-6: Prevent persisting records with degraded weak KDF profiles
  if (isArgon2WriteBlocked()) {
    logSecurityEvent(
      securityEventCodes.storageDesktopWriteFailed,
      'Blocked vault persistence because Argon2id memory profile is degraded below safe threshold.',
      'critical',
    );
    return false;
  }

  try {
    // P1-5: Ensure version counter is present
    state.versionCounter = state.versionCounter ?? 1;

    const payloadStr = JSON.stringify(state);
    const savedToDesktop = await writeDesktopVaultDatabase(payloadStr);
    writeLocalFallbackMirror(state, payloadStr, savedToDesktop);

    if (isTestEnv || !savedToDesktop) {
      // K-5: when OPFS is the primary persistence path (web builds, tests),
      // its failure is fatal — returning `true` here used to laundisempty
      // or failed writes as success.
      try {
        await writeToOPFSWithTimeout(payloadStr, 1000);
      } catch {
        return false;
      }
    } else {
      // Native app-data writes are already durable; OPFS is only a secondary
      // mirror there — failures are logged inside and must not crash the
      // fire-and-forget chain.
      void writeToOPFSWithTimeout(payloadStr, 1000).catch(() => {});
    }
    return true;
  } catch (err) {
    logSecurityEvent(
      securityEventCodes.storageDesktopWriteFailed,
      'Failed writing SQLite persistence block.',
      'critical',
      { error: err instanceof Error ? err.message : String(err) },
    );
    return false;
  }
}
