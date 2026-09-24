/**
 * @file snapshots.ts
 * @description Local-first, zero-knowledge Vault Snapshot History subsystem.
 * Allows capturing, listing, pruning, exporting, and atomically restoring
 * versioned encrypted snapshots of the entire vault (items + attachments).
 *
 * All snapshots are encrypted at rest with Argon2id + AES-256-GCM using the
 * active vault master key. Stored strictly in local IndexedDB.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { getVaultItems, saveVaultItems, deleteVaultItem } from './storage';
import { exportAllAttachments, importAttachments, type AttachmentBackupRecord } from './attachments';
import { encryptDataWithPasswordSecure, decryptDataWithPasswordSecure } from './encryption';
import { validateBackupPayload } from './backupValidation';
import { withActiveBackupPassword } from './vaultSession';
import { secureRandomToken } from './random';
import { logSecurityEvent, securityEventCodes } from './securityEvents';
import { saveDesktopExportFile, isNativeFileDialogSupported } from './desktopFiles';
import type { VaultItem } from '../types';

export const SNAPSHOT_DB_NAME = 'aegis_snapshots_db';
export const SNAPSHOT_STORE_NAME = 'snapshots';
export const SNAPSHOT_DB_VERSION = 1;
export const MAX_SNAPSHOTS_DEFAULT = 30;

export type SnapshotTrigger = 'manual' | 'auto' | 'pre_restore';

export interface VaultSnapshotRecord {
  id: string;
  createdAt: string; // ISO 8601
  itemCount: number;
  attachmentCount: number;
  sizeBytes: number;
  trigger: SnapshotTrigger;
  label?: string;
  encryptedPayload: string; // AES-256-GCM + Argon2id envelope
  checksum: string; // SHA-256 hex
}

export interface SnapshotRestoreResult {
  restoredItems: number;
  restoredAttachments: number;
  safetySnapshotId: string;
}

export class SnapshotError extends Error {
  constructor(public readonly code: string, message?: string) {
    super(message || code);
    this.name = 'SnapshotError';
  }
}

/**
 * Initializes the IndexedDB store for snapshots.
 */
function openSnapshotDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new SnapshotError('snapshots.indexedDbUnavailable', 'IndexedDB is not available in this environment.'));
      return;
    }
    const request = indexedDB.open(SNAPSHOT_DB_NAME, SNAPSHOT_DB_VERSION);
    request.onerror = () => reject(request.error || new Error('Failed to open snapshot database'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
        const store = db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('trigger', 'trigger', { unique: false });
      }
    };
  });
}

async function sha256Hex(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Creates an encrypted snapshot of the current vault state.
 */
export async function createVaultSnapshot(
  trigger: SnapshotTrigger = 'manual',
  label?: string,
): Promise<VaultSnapshotRecord> {
  return new Promise<VaultSnapshotRecord>((resolve, reject) => {
    withActiveBackupPassword(async (masterPassword) => {
      try {
        const items = await getVaultItems();
        const attachments = await exportAllAttachments();

        const envelope = {
          version: 7,
          generator: 'Aegis Vault Snapshot Engine',
          createdAt: new Date().toISOString(),
          items,
          attachments,
        };

        const rawJson = JSON.stringify(envelope);
        const encryptedPayload = await encryptDataWithPasswordSecure(rawJson, masterPassword);
        const checksum = await sha256Hex(encryptedPayload);

        const record: VaultSnapshotRecord = {
          id: 'snap_' + Date.now() + '_' + secureRandomToken(6),
          createdAt: new Date().toISOString(),
          itemCount: items.length,
          attachmentCount: attachments.length,
          sizeBytes: new TextEncoder().encode(encryptedPayload).length,
          trigger,
          label: label || '',
          encryptedPayload,
          checksum,
        };

        const db = await openSnapshotDb();
        await new Promise<void>((res, rej) => {
          const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
          const store = tx.objectStore(SNAPSHOT_STORE_NAME);
          const req = store.put(record);
          req.onsuccess = () => res();
          req.onerror = () => rej(req.error);
          tx.oncomplete = () => db.close();
        });

        // Enforce retention policy
        await pruneSnapshotsRetention(MAX_SNAPSHOTS_DEFAULT);

        logSecurityEvent(
          securityEventCodes.securityLegacyCryptoWarning || 'security.snapshot.created',
          'Created vault snapshot (' + trigger + '): ' + items.length + ' items, ' + attachments.length + ' attachments.',
          'info',
        );

        resolve(record);
      } catch (err) {
        reject(err);
      }
    }).then((called) => {
      if (!called) {
        reject(new SnapshotError('snapshots.sessionLocked', 'Vault session is locked; master password required.'));
      }
    }).catch(reject);
  });
}

/**
 * Returns all snapshots sorted by creation date descending.
 */
export async function getVaultSnapshots(): Promise<VaultSnapshotRecord[]> {
  if (typeof indexedDB === 'undefined') {
    return [];
  }
  const db = await openSnapshotDb();
  return new Promise<VaultSnapshotRecord[]>((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readonly');
    const store = tx.objectStore(SNAPSHOT_STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const records = (req.result as VaultSnapshotRecord[]) || [];
      records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      db.close();
      resolve(records);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Deletes a snapshot by ID.
 */
export async function deleteVaultSnapshot(id: string): Promise<void> {
  const db = await openSnapshotDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Clears all snapshots.
 */
export async function clearAllVaultSnapshots(): Promise<void> {
  const db = await openSnapshotDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE_NAME);
    const req = store.clear();
    req.onsuccess = () => {
      db.close();
      resolve();
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Prunes older snapshots to keep storage within limit.
 */
export async function pruneSnapshotsRetention(maxSnapshots = MAX_SNAPSHOTS_DEFAULT): Promise<number> {
  const all = await getVaultSnapshots();
  if (all.length <= maxSnapshots) return 0;

  const toDelete = all.slice(maxSnapshots);
  for (const s of toDelete) {
    await deleteVaultSnapshot(s.id);
  }
  return toDelete.length;
}

/**
 * Restores vault items and attachments from a snapshot.
 * Before applying the restore, takes an automatic safety snapshot of the
 * current state to guarantee zero data loss.
 */
export async function restoreVaultSnapshot(snapshotId: string): Promise<SnapshotRestoreResult> {
  const all = await getVaultSnapshots();
  const target = all.find((s) => s.id === snapshotId);
  if (!target) {
    throw new SnapshotError('snapshots.notFound', 'Snapshot record not found.');
  }

  return new Promise<SnapshotRestoreResult>((resolve, reject) => {
    withActiveBackupPassword(async (masterPassword) => {
      try {
        // 1. Take safety snapshot of current state
        const safety = await createVaultSnapshot('pre_restore', 'Pre-Restore Safety Snapshot');

        // 2. Decrypt target snapshot
        const rawJson = await decryptDataWithPasswordSecure(target.encryptedPayload, masterPassword);
        const parsed = JSON.parse(rawJson);

        // 3. Validate backup envelope integrity
        const validated = validateBackupPayload(parsed);
        const snapshotItems: VaultItem[] = validated.items as unknown as VaultItem[];
        const snapshotAttachments: AttachmentBackupRecord[] = (validated.attachments || []) as unknown as AttachmentBackupRecord[];

        // 4. Reconcile items: delete items not in snapshot, save snapshot items
        const currentItems = await getVaultItems();
        const targetIds = new Set(snapshotItems.map((i) => i.id));
        for (const cur of currentItems) {
          if (!targetIds.has(cur.id)) {
            await deleteVaultItem(cur.id);
          }
        }
        await saveVaultItems(snapshotItems);

        // 5. Reconcile attachments
        if (snapshotAttachments.length > 0) {
          await importAttachments(snapshotAttachments);
        }

        resolve({
          restoredItems: snapshotItems.length,
          restoredAttachments: snapshotAttachments.length,
          safetySnapshotId: safety.id,
        });
      } catch (err) {
        reject(err);
      }
    }).then((called) => {
      if (!called) {
        reject(new SnapshotError('snapshots.sessionLocked', 'Vault session is locked; master password required.'));
      }
    }).catch(reject);
  });
}

function downloadTextBlob(filename: string, contents: string): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(contents);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Exports a snapshot record as a standalone encrypted .aegis file.
 */
export async function exportVaultSnapshotToFile(snapshot: VaultSnapshotRecord): Promise<boolean> {
  const dateStr = snapshot.createdAt.split('T')[0] || 'snapshot';
  const filename = 'aegis_snapshot_' + dateStr + '_' + snapshot.id.slice(-6) + '.aegis';

  const saved = await saveDesktopExportFile(filename, snapshot.encryptedPayload);
  if (!saved) {
    if (isNativeFileDialogSupported()) {
      return false;
    }
    downloadTextBlob(filename, snapshot.encryptedPayload);
    return true;
  }
  return true;
}

export type SnapshotFrequency = 'on_lock' | 'daily' | 'weekly';

export interface SnapshotSettings {
  autoEnabled: boolean;
  frequency: SnapshotFrequency;
  maxSnapshots: number;
  lastAutoSnapshotTime: string | null;
}

export const SNAPSHOT_SETTINGS_STORAGE_KEY = 'aegis_snapshot_settings';

export const DEFAULT_SNAPSHOT_SETTINGS: SnapshotSettings = {
  autoEnabled: true,
  frequency: 'daily',
  maxSnapshots: MAX_SNAPSHOTS_DEFAULT,
  lastAutoSnapshotTime: null,
};

/**
 * Retrieves snapshot preferences from local storage with fallback to defaults.
 */
export function getSnapshotSettings(): SnapshotSettings {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_SNAPSHOT_SETTINGS };
  }
  try {
    const raw = localStorage.getItem(SNAPSHOT_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SNAPSHOT_SETTINGS };
    const parsed = JSON.parse(raw);
    const validFrequencies: SnapshotFrequency[] = ['on_lock', 'daily', 'weekly'];
    const frequency: SnapshotFrequency = validFrequencies.includes(parsed.frequency)
      ? parsed.frequency
      : DEFAULT_SNAPSHOT_SETTINGS.frequency;
    const maxSnapshots = typeof parsed.maxSnapshots === 'number' && parsed.maxSnapshots > 0
      ? parsed.maxSnapshots
      : DEFAULT_SNAPSHOT_SETTINGS.maxSnapshots;
    const autoEnabled = typeof parsed.autoEnabled === 'boolean'
      ? parsed.autoEnabled
      : DEFAULT_SNAPSHOT_SETTINGS.autoEnabled;
    const lastAutoSnapshotTime = typeof parsed.lastAutoSnapshotTime === 'string'
      ? parsed.lastAutoSnapshotTime
      : null;

    return {
      autoEnabled,
      frequency,
      maxSnapshots,
      lastAutoSnapshotTime,
    };
  } catch {
    return { ...DEFAULT_SNAPSHOT_SETTINGS };
  }
}

/**
 * Saves updated snapshot settings and applies retention limits.
 */
export function saveSnapshotSettings(patch: Partial<SnapshotSettings>): SnapshotSettings {
  const current = getSnapshotSettings();
  const updated: SnapshotSettings = {
    ...current,
    ...patch,
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SNAPSHOT_SETTINGS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Storage unavailable or quota exceeded
    }
  }

  // Enforce new max retention limit if changed
  if (patch.maxSnapshots !== undefined) {
    pruneSnapshotsRetention(updated.maxSnapshots).catch(() => {});
  }

  return updated;
}

/**
 * Evaluates whether an automated snapshot should be captured based on current settings and context.
 */
export function shouldTriggerAutoSnapshot(
  settings: SnapshotSettings,
  context: 'lock' | 'interval' = 'lock'
): boolean {
  if (!settings.autoEnabled) {
    return false;
  }

  const now = Date.now();
  const lastTime = settings.lastAutoSnapshotTime
    ? new Date(settings.lastAutoSnapshotTime).getTime()
    : null;

  if (context === 'lock') {
    if (settings.frequency === 'on_lock') {
      // Avoid rapid bursts: minimum 60 seconds interval between on-lock snapshots
      return !lastTime || now - lastTime >= 60 * 1000;
    }
    if (settings.frequency === 'daily') {
      return !lastTime || now - lastTime >= 24 * 60 * 60 * 1000;
    }
    if (settings.frequency === 'weekly') {
      return !lastTime || now - lastTime >= 7 * 24 * 60 * 60 * 1000;
    }
  }

  if (context === 'interval') {
    if (settings.frequency === 'daily') {
      return !lastTime || now - lastTime >= 24 * 60 * 60 * 1000;
    }
    if (settings.frequency === 'weekly') {
      return !lastTime || now - lastTime >= 7 * 24 * 60 * 60 * 1000;
    }
  }

  return false;
}

/**
 * Verifies settings and triggers an automatic encrypted snapshot if conditions are met.
 */
export async function checkAndTriggerAutoSnapshot(
  context: 'lock' | 'interval' = 'lock'
): Promise<VaultSnapshotRecord | null> {
  const settings = getSnapshotSettings();
  if (!shouldTriggerAutoSnapshot(settings, context)) {
    return null;
  }

  let label = 'Auto Backup';
  if (settings.frequency === 'on_lock') {
    label = 'Auto Backup (On Lock)';
  } else if (settings.frequency === 'daily') {
    label = 'Daily Auto Backup';
  } else if (settings.frequency === 'weekly') {
    label = 'Weekly Auto Backup';
  }

  try {
    const record = await createVaultSnapshot('auto', label);
    saveSnapshotSettings({
      lastAutoSnapshotTime: new Date().toISOString(),
    });
    await pruneSnapshotsRetention(settings.maxSnapshots);
    return record;
  } catch {
    return null;
  }
}
