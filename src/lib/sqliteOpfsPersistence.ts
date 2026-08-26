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
import { setIndexedDbItemSync } from './indexedDbStorage';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import { parseVaultDatabaseState, type VersionedVaultDatabaseState } from './vaultDatabaseFormat';
import { isTestEnv } from './environment';
import { isArgon2WriteBlocked } from './argon2id';

export const DB_FILENAME = 'aegis_sqlite.db';
export const LOCAL_FALLBACK_KEY = 'aegis_sqlite_fallback';

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
  | { kind: 'unavailable' };

let lastObservedVersionCounter = 0;

export function getLastObservedVersionCounter(): number {
  return lastObservedVersionCounter;
}

export function setLastObservedVersionCounter(val: number): void {
  lastObservedVersionCounter = val;
}

function processLoadedStateIntegrity(state: VersionedVaultDatabaseState): void {
  if (typeof state.versionCounter === 'number') {
    if (lastObservedVersionCounter > 0 && state.versionCounter < lastObservedVersionCounter) {
      logSecurityEvent(
        securityEventCodes.storageLegacyMigrationFailed,
        `Vault database rollback detected! Loaded versionCounter (${state.versionCounter}) is lower than last observed (${lastObservedVersionCounter}).`,
        'critical',
        { loadedVersion: state.versionCounter, expectedMinVersion: lastObservedVersionCounter },
      );
    } else {
      lastObservedVersionCounter = Math.max(lastObservedVersionCounter, state.versionCounter);
    }
  }
}

/**
 * Reads the vault database from desktop app-data or the OPFS mirror.
 * Never throws — unexpected shapes are surfaced through `parseVaultDatabaseState`.
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
    const state = parseVaultDatabaseState(desktopPayload);
    processLoadedStateIntegrity(state);
    setIndexedDbItemSync(LOCAL_FALLBACK_KEY, createDesktopManagedSetupMarker(state));
    return {
      kind: 'state',
      state,
      logLabel: `sqlite3_open("${getNativeVaultStorageScope()}:///${DB_FILENAME}")`,
      resaveAfterLoad: false,
    };
  }

  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.getDirectory) {
    const root = await navigator.storage.getDirectory();
    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await root.getFileHandle(DB_FILENAME);
    } catch {
      // File does not exist yet. Initialize using localStorage backup or start fresh.
      return { kind: 'missing' };
    }

    const file = await fileHandle.getFile();
    const content = await file.text();
    if (content) {
      const state = parseVaultDatabaseState(content);
      processLoadedStateIntegrity(state);
      return {
        kind: 'state',
        state,
        logLabel: `sqlite3_open("opfs:///${DB_FILENAME}")`,
        resaveAfterLoad: true,
      };
    }
    return { kind: 'empty' };
  }

  // Fallback to standard sandbox-compliant simulated OPFS persistence.
  return { kind: 'unavailable' };
}

/**
 * Writes the payload string to the sandboxed OPFS file standard in the background.
 * Uses Promise.race to enforce a timeout in case file locks are held by old sessions (hot-reloads).
 */
async function writeToOPFSWithTimeout(payloadStr: string, timeoutMs: number): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage || !navigator.storage.getDirectory) {
    return;
  }

  const opfsWritePromise = (async () => {
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_FILENAME, { create: true });

    // Use createWritable if supported (standard), or fallback to alternative file APIs
    if ('createWritable' in fileHandle) {
      const writable = await (fileHandle as FileSystemFileHandle & { createWritable(): Promise<FileSystemWritableFileStream> }).createWritable();
      await writable.write(payloadStr);
      await writable.close();
    }
  })();

  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(() => reject(new Error('OPFS write timed out (lock leak suspected)')), timeoutMs);
  });

  try {
    await Promise.race([opfsWritePromise, timeoutPromise]);
  } catch (err) {
    logSecurityEvent(
      securityEventCodes.storageDesktopWriteFailed,
      'OPFS mirror write failed or timed out.',
      'critical',
      { error: err instanceof Error ? err.message : String(err) },
    );
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
      await writeToOPFSWithTimeout(payloadStr, 1000);
    } else {
      // Native app-data writes are already durable; OPFS is only a secondary mirror there.
      void writeToOPFSWithTimeout(payloadStr, 1000);
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
