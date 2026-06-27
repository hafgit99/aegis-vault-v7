/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VaultItem } from '../../types';
import { encryptDataWithPasswordSecure, decryptDataWithPasswordSecure } from '../encryption';
import { secureRandomToken } from '../random';
import { SyncProvider, SyncResult, SyncMetadata, SyncError, syncErrorCodes, SyncConflictItem } from './syncTypes';

const VAULT_VERSION = '7.0';

/** Returns a stable per-device random UUID, generated once and persisted in localStorage. */
function getOrCreateDeviceId(): string {
  const key = 'aegis_sync_device_id';
  const store = typeof localStorage !== 'undefined' ? localStorage : null;
  const existing = store?.getItem(key);
  if (existing) return existing;
  const id = secureRandomToken(16);
  store?.setItem(key, id);
  return id;
}

async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Envelope Build / Parse ──────────────────────────────────────────────────

/**
 * Encrypts vault items into a portable sync envelope using the existing
 * Aegis Argon2id + AES-256-GCM backup format (encryptDataWithPasswordSecure).
 *
 * The envelope includes all items (active + tombstones) so that remote peers
 * can replay deletions correctly.
 */
export async function buildSyncEnvelope(
  items: VaultItem[],
  masterPassword: string,
): Promise<{ encryptedBlob: string; metadata: SyncMetadata }> {
  const payload = JSON.stringify(items);
  const encryptedBlob = await encryptDataWithPasswordSecure(payload, masterPassword);
  const checksum = await sha256Hex(encryptedBlob);

  const latestItemUpdatedAt = items.reduce((latest, item) => {
    const candidate = new Date(item.updatedAt ?? item.createdAt).getTime();
    return Number.isFinite(candidate) && candidate > latest ? candidate : latest;
  }, 0);

  const metadata: SyncMetadata = {
    updatedAt: new Date(latestItemUpdatedAt || Date.now()).toISOString(),
    deviceId: getOrCreateDeviceId(),
    vaultVersion: VAULT_VERSION,
    checksum,
    itemCount: items.length,
  };

  return { encryptedBlob, metadata };
}

/**
 * Decrypts and parses a sync envelope, verifying the checksum first.
 */
export async function parseSyncEnvelope(
  encryptedBlob: string,
  masterPassword: string,
  expectedChecksum?: string,
): Promise<VaultItem[]> {
  if (expectedChecksum) {
    const actual = await sha256Hex(encryptedBlob);
    if (actual !== expectedChecksum) {
      throw new SyncError(syncErrorCodes.checksumMismatch, 'Remote vault checksum mismatch — possible tampering');
    }
  }

  let decrypted: string;
  try {
    decrypted = await decryptDataWithPasswordSecure(encryptedBlob, masterPassword);
  } catch {
    throw new SyncError(syncErrorCodes.invalidEnvelope, 'Failed to decrypt remote vault — wrong password or corrupt data');
  }

  try {
    return JSON.parse(decrypted) as VaultItem[];
  } catch {
    throw new SyncError(syncErrorCodes.invalidEnvelope, 'Remote vault contains invalid JSON after decryption');
  }
}

// ─── LWW Conflict Resolution ─────────────────────────────────────────────────

/**
 * Merges remote items into local items using Last-Write-Wins semantics:
 *
 * - For each remote item, compare `updatedAt` timestamps.
 * - Remote wins if its `updatedAt` is strictly later.
 * - Tombstones (deleted=true) are treated the same as active items.
 * - Items present only remotely are added to local.
 * - Items present only locally are kept as-is.
 *
 * Returns `{ merged, conflicts }` where `conflicts` contains items where
 * the difference in `updatedAt` is under 5 seconds (near-simultaneous writes).
 */
export function resolveLWWConflicts(
  localItems: VaultItem[],
  remoteItems: VaultItem[],
): { merged: VaultItem[]; conflicts: SyncConflictItem[] } {
  const localMap = new Map<string, VaultItem>(localItems.map((i) => [i.id, i]));
  const conflicts: SyncConflictItem[] = [];

  for (const remote of remoteItems) {
    const local = localMap.get(remote.id);
    if (!local) {
      // Remote-only item — add it
      localMap.set(remote.id, remote);
      continue;
    }

    const localTs = new Date(local.updatedAt ?? local.createdAt).getTime();
    const remoteTs = new Date(remote.updatedAt ?? remote.createdAt).getTime();
    const diffMs = Math.abs(remoteTs - localTs);

    if (remoteTs > localTs) {
      // Remote is newer — apply it
      localMap.set(remote.id, remote);
      if (diffMs < 5_000) {
        // Near-simultaneous — flag as conflict for visibility
        conflicts.push({
          id: remote.id,
          title: remote.title,
          localUpdatedAt: local.updatedAt,
          remoteUpdatedAt: remote.updatedAt,
        });
      }
    }
    // else: local is newer or same timestamp — keep local silently
  }

  return { merged: Array.from(localMap.values()), conflicts };
}

// ─── Main Sync Orchestration ─────────────────────────────────────────────────

/**
 * Performs a full bidirectional sync against the configured provider:
 *
 * 1. Download remote metadata (lightweight check).
 * 2. If remote is newer, download and decrypt the full vault blob.
 * 3. Apply LWW merge to produce the canonical item list.
 * 4. Encrypt the merged list and upload.
 * 5. Return a SyncResult with merge statistics and any conflicts.
 *
 * @param provider — configured SyncProvider instance
 * @param localItems — current decrypted vault items from local storage
 * @param masterPassword — used for encrypt/decrypt operations
 */
export async function performSync(
  provider: SyncProvider,
  localItems: VaultItem[],
  masterPassword: string,
): Promise<SyncResult & { mergedItems: VaultItem[] }> {
  let remoteMetadata: SyncMetadata | null;
  try {
    remoteMetadata = await provider.getRemoteMetadata();
  } catch (err) {
    const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.downloadFailed, String(err));
    return { status: 'error', error: syncErr, mergedItems: localItems };
  }

  let mergedItems = localItems;
  let mergedCount = 0;
  let conflicts: SyncConflictItem[] = [];

  if (remoteMetadata) {
    // Determine whether the remote snapshot is worth downloading.
    // We always download when we have no local data yet, or when the remote
    // metadata timestamp is strictly newer than our newest local item.
    const latestLocalTs = localItems.reduce((max, i) => {
      const ts = new Date(i.updatedAt ?? i.createdAt).getTime();
      return ts > max ? ts : max;
    }, 0);
    const remoteTs = new Date(remoteMetadata.updatedAt).getTime();

    if (remoteTs > latestLocalTs || localItems.length === 0) {
      let remoteBlob: string | null;
      try {
        remoteBlob = await provider.downloadVault();
      } catch (err) {
        const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.downloadFailed, String(err));
        return { status: 'error', error: syncErr, mergedItems: localItems };
      }

      if (remoteBlob) {
        let remoteItems: VaultItem[];
        try {
          remoteItems = await parseSyncEnvelope(remoteBlob, masterPassword, remoteMetadata.checksum);
        } catch (err) {
          const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.invalidEnvelope, String(err));
          return { status: 'error', error: syncErr, mergedItems: localItems };
        }

        const resolved = resolveLWWConflicts(localItems, remoteItems);
        mergedItems = resolved.merged;
        conflicts = resolved.conflicts;
        mergedCount = mergedItems.length - localItems.length;
      }
    }
  }

  // Upload the merged state
  let encryptedBlob: string;
  let metadata: SyncMetadata;
  try {
    ({ encryptedBlob, metadata } = await buildSyncEnvelope(mergedItems, masterPassword));
  } catch (err) {
    return {
      status: 'error',
      error: new SyncError(syncErrorCodes.uploadFailed, `Encryption failed: ${String(err)}`),
      mergedItems,
    };
  }

  try {
    await provider.uploadVault(encryptedBlob, metadata);
  } catch (err) {
    const syncErr = err instanceof SyncError ? err : new SyncError(syncErrorCodes.uploadFailed, String(err));
    return { status: 'error', error: syncErr, mergedItems };
  }

  return {
    status: conflicts.length > 0 ? 'conflict' : 'success',
    syncedAt: metadata.updatedAt,
    mergedCount,
    conflicts,
    mergedItems,
  };
}
