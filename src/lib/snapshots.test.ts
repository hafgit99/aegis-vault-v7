/**
 * @vitest-environment jsdom
 */
/**
 * @file snapshots.test.ts
 * @description Comprehensive unit tests for the Vault Snapshot History subsystem.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createVaultSnapshot,
  getVaultSnapshots,
  deleteVaultSnapshot,
  clearAllVaultSnapshots,
  pruneSnapshotsRetention,
  restoreVaultSnapshot,
  exportVaultSnapshotToFile,
  type VaultSnapshotRecord,
} from './snapshots';
import * as snapshotsLib from './snapshots';
import * as storage from './storage';
import * as attachments from './attachments';
import * as encryption from './encryption';
import * as vaultSession from './vaultSession';
import * as desktopFiles from './desktopFiles';
import { MAX_BACKUP_FILE_SIZE } from './backupValidation';
import { MAX_RESTORE_ITEM_COUNT } from './snapshots';
import type { VaultItem } from '../types';

// Mock fake IndexedDB for unit tests
const mockStore = new Map<string, VaultSnapshotRecord>();

const mockIDBDatabase = {
  transaction: vi.fn(() => ({
    objectStore: vi.fn(() => ({
      put: vi.fn((record: VaultSnapshotRecord) => {
        mockStore.set(record.id, record);
        const req: { onsuccess?: () => void; onerror?: (e: unknown) => void } = {};
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      getAll: vi.fn(() => {
        const req: { result?: VaultSnapshotRecord[]; onsuccess?: () => void; onerror?: (e: unknown) => void } = {
          result: Array.from(mockStore.values()),
        };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      delete: vi.fn((id: string) => {
        mockStore.delete(id);
        const req: { onsuccess?: () => void; onerror?: (e: unknown) => void } = {};
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
      clear: vi.fn(() => {
        mockStore.clear();
        const req: { onsuccess?: () => void; onerror?: (e: unknown) => void } = {};
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      }),
    })),
    oncomplete: null as (() => void) | null,
  })),
  close: vi.fn(),
};

const mockIndexedDB = {
  open: vi.fn(() => {
    const req: { result?: typeof mockIDBDatabase; onsuccess?: () => void; onerror?: () => void; onupgradeneeded?: () => void } = {
      result: mockIDBDatabase,
    };
    setTimeout(() => req.onsuccess?.(), 0);
    return req;
  }),
};

vi.stubGlobal('indexedDB', mockIndexedDB);

describe('Vault Snapshot History (snapshots.ts)', () => {
  const sampleItems: VaultItem[] = [
    {
      id: 'item-1',
      title: 'GitHub',
      username: 'dev@aegisvault.xyz',
      password: 'password123!',
      url: 'https://github.com',
      notes: '',
      category: 'login',
      createdAt: '2026-09-24T12:00:00.000Z',
      updatedAt: '2026-09-24T12:00:00.000Z',
    },
    {
      id: 'item-2',
      title: 'ProtonMail',
      username: 'admin@aegisvault.xyz',
      password: 'proton-secret-key',
      url: 'https://proton.me',
      notes: '',
      category: 'login',
      createdAt: '2026-09-24T12:30:00.000Z',
      updatedAt: '2026-09-24T12:30:00.000Z',
    },
  ];

  beforeEach(() => {
    mockStore.clear();
    vi.clearAllMocks();

    vi.spyOn(storage, 'getVaultItems').mockResolvedValue(sampleItems);
    // Y-14: creating a snapshot must never purge the trash. Snapshot creation
    // used to reach `getVaultItems`, which silently and irreversibly deleted
    // every trashed item past the 15-day retention window.
    vi.spyOn(storage, 'purgeExpiredTrashItems');
    vi.spyOn(storage, 'saveVaultItems').mockResolvedValue(sampleItems);
    vi.spyOn(storage, 'deleteVaultItem').mockResolvedValue([]);
    vi.spyOn(attachments, 'exportAllAttachments').mockResolvedValue([]);
    vi.spyOn(attachments, 'importAttachments').mockResolvedValue([]);

    vi.spyOn(vaultSession, 'withActiveBackupPassword').mockImplementation(async (callback) => {
      return callback('correct-master-password');
    });

    vi.spyOn(encryption, 'encryptDataWithPasswordSecure').mockImplementation(async (json, _pw) => {
      return JSON.stringify({ encrypted: true, content: json });
    });

    vi.spyOn(encryption, 'decryptDataWithPasswordSecure').mockImplementation(async (payload, _pw) => {
      const parsed = JSON.parse(payload);
      return parsed.content;
    });
  });

  it('creates an encrypted vault snapshot with correct metadata', async () => {
    const snap = await createVaultSnapshot('manual', 'Manual Test Snapshot');

    expect(snap).toBeDefined();
    expect(snap.id).toMatch(/^snap_/);
    expect(snap.itemCount).toBe(2);
    expect(snap.attachmentCount).toBe(0);
    expect(snap.trigger).toBe('manual');
    expect(snap.label).toBe('Manual Test Snapshot');
    expect(snap.sizeBytes).toBeGreaterThan(0);
    expect(snap.checksum).toBeDefined();

    const all = await getVaultSnapshots();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(snap.id);
  });

  it('prunes oldest snapshots according to retention limit', async () => {
    // Add 5 snapshots
    for (let i = 0; i < 5; i++) {
      const record: VaultSnapshotRecord = {
        id: 'snap_' + i,
        createdAt: new Date(Date.now() - (5 - i) * 1000).toISOString(),
        itemCount: 2,
        attachmentCount: 0,
        sizeBytes: 100,
        trigger: 'auto',
        encryptedPayload: '{}',
        checksum: 'abc',
      };
      mockStore.set(record.id, record);
    }

    expect(await getVaultSnapshots()).toHaveLength(5);
    const pruned = await pruneSnapshotsRetention(3);
    expect(pruned).toBe(2);

    const remaining = await getVaultSnapshots();
    expect(remaining).toHaveLength(3);
  });

  it('deletes a specific snapshot by id', async () => {
    const snap = await createVaultSnapshot('manual');
    expect(await getVaultSnapshots()).toHaveLength(1);

    await deleteVaultSnapshot(snap.id);
    expect(await getVaultSnapshots()).toHaveLength(0);
  });

  it('clears all snapshots', async () => {
    await createVaultSnapshot('manual');
    await createVaultSnapshot('auto');
    expect(await getVaultSnapshots()).toHaveLength(2);

    await clearAllVaultSnapshots();
    expect(await getVaultSnapshots()).toHaveLength(0);
  });

  it('restores vault from a snapshot and creates a safety pre-restore snapshot', async () => {
    const initialSnap = await createVaultSnapshot('manual', 'Initial');
    expect(await getVaultSnapshots()).toHaveLength(1);

    const result = await restoreVaultSnapshot(initialSnap.id);

    expect(result.restoredItems).toBe(2);
    expect(result.restoredAttachments).toBe(0);
    expect(result.safetySnapshotId).toBeDefined();

    // Verify a safety snapshot was created
    const all = await getVaultSnapshots();
    expect(all).toHaveLength(2);
    const safetySnap = all.find((s) => s.id === result.safetySnapshotId);
    expect(safetySnap).toBeDefined();
    expect(safetySnap?.trigger).toBe('pre_restore');
  });

  it('exports snapshot to desktop file when desktop dialog is supported', async () => {
    vi.spyOn(desktopFiles, 'saveDesktopExportFile').mockResolvedValue(true);
    const snap = await createVaultSnapshot('manual');

    const result = await exportVaultSnapshotToFile(snap);
    expect(result).toBe(true);
    expect(desktopFiles.saveDesktopExportFile).toHaveBeenCalledWith(
      expect.stringMatching(/^aegis_snapshot_/),
      snap.encryptedPayload,
    );
  });

  it('manages auto-snapshot settings and persistence in localStorage', () => {
    localStorage.clear();
    const defaults = snapshotsLib.getSnapshotSettings();
    expect(defaults.autoEnabled).toBe(true);
    expect(defaults.frequency).toBe('daily');
    expect(defaults.maxSnapshots).toBe(30);
    expect(defaults.lastAutoSnapshotTime).toBeNull();

    const updated = snapshotsLib.saveSnapshotSettings({
      autoEnabled: false,
      frequency: 'on_lock',
      maxSnapshots: 20,
    });

    expect(updated.autoEnabled).toBe(false);
    expect(updated.frequency).toBe('on_lock');
    expect(updated.maxSnapshots).toBe(20);

    const reloaded = snapshotsLib.getSnapshotSettings();
    expect(reloaded.autoEnabled).toBe(false);
    expect(reloaded.frequency).toBe('on_lock');
    expect(reloaded.maxSnapshots).toBe(20);
  });

  it('correctly evaluates shouldTriggerAutoSnapshot based on frequency and context', () => {
    // Disabled setting
    expect(
      snapshotsLib.shouldTriggerAutoSnapshot(
        { autoEnabled: false, frequency: 'daily', maxSnapshots: 30, lastAutoSnapshotTime: null },
        'lock'
      )
    ).toBe(false);

    // On lock: no previous snapshot -> true
    expect(
      snapshotsLib.shouldTriggerAutoSnapshot(
        { autoEnabled: true, frequency: 'on_lock', maxSnapshots: 30, lastAutoSnapshotTime: null },
        'lock'
      )
    ).toBe(true);

    // On lock: snapshot taken 10 seconds ago -> false (burst protection)
    const recent = new Date(Date.now() - 10 * 1000).toISOString();
    expect(
      snapshotsLib.shouldTriggerAutoSnapshot(
        { autoEnabled: true, frequency: 'on_lock', maxSnapshots: 30, lastAutoSnapshotTime: recent },
        'lock'
      )
    ).toBe(false);

    // Daily on interval: > 24 hours ago -> true
    const dayOld = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(
      snapshotsLib.shouldTriggerAutoSnapshot(
        { autoEnabled: true, frequency: 'daily', maxSnapshots: 30, lastAutoSnapshotTime: dayOld },
        'interval'
      )
    ).toBe(true);
  });

  it('triggers automated snapshot and updates lastAutoSnapshotTime', async () => {
    localStorage.clear();
    snapshotsLib.saveSnapshotSettings({
      autoEnabled: true,
      frequency: 'on_lock',
      lastAutoSnapshotTime: null,
    });

    const record = await snapshotsLib.checkAndTriggerAutoSnapshot('lock');
    expect(record).not.toBeNull();
    expect(record?.trigger).toBe('auto');
    expect(record?.label).toBe('Auto Backup (On Lock)');

    const updatedSettings = snapshotsLib.getSnapshotSettings();
    expect(updatedSettings.lastAutoSnapshotTime).toBeDefined();

    // Second immediate lock should be ignored due to burst limit
    const secondTry = await snapshotsLib.checkAndTriggerAutoSnapshot('lock');
    expect(secondTry).toBeNull();
  });

  // ─── Y-14: backup paths must not destroy the trash ────────────────────────

  it('Y-14: creating a snapshot does not purge expired trash', async () => {
    await vaultSession.openVaultSession('correct-master-password', 'correct-master-password', new Uint8Array(32));

    await snapshotsLib.createVaultSnapshot('manual', 'must not purge');

    // The regression: snapshot creation reached `getVaultItems`, which deleted
    // every trashed item past 15 days as a side effect of reading.
    expect(storage.purgeExpiredTrashItems).not.toHaveBeenCalled();
  });

  it('Y-14: the automatic snapshot path does not purge expired trash', async () => {
    await vaultSession.openVaultSession('correct-master-password', 'correct-master-password', new Uint8Array(32));

    // The record itself is irrelevant here — auto-snapshot is throttled, so it
    // may legitimately decline to write. What matters is that no trash purge
    // can be reached from this path.
    await snapshotsLib.checkAndTriggerAutoSnapshot('lock');

    expect(storage.purgeExpiredTrashItems).not.toHaveBeenCalled();
  });

  // ─── O-16 / O-17: restore must be atomic and bounded ─────────────────────

  it('O-16: restores through a single atomic replace, not per-item deletes', async () => {
    // The regression: the old path looped `deleteVaultItem` and then
    // `saveVaultItems`. Because the vault is a whole-blob rewrite, that was one
    // full persist per deleted item, and a failure part-way through left the
    // vault half-deleted with no rollback.
    const replaceSpy = vi.spyOn(storage, 'replaceVaultItems').mockResolvedValue(sampleItems);
    vi.spyOn(storage, 'deleteVaultItem').mockResolvedValue([]);

    await vaultSession.openVaultSession('correct-master-password', 'correct-master-password', new Uint8Array(32));
    await snapshotsLib.createVaultSnapshot('manual', 'before restore');
    const snapshots = await snapshotsLib.getVaultSnapshots();

    const outcome = await snapshotsLib.restoreVaultSnapshot(snapshots[0]!.id);

    expect(outcome.restoredItems).toBe(sampleItems.length);
    expect(replaceSpy).toHaveBeenCalledTimes(1);
    expect(storage.deleteVaultItem).not.toHaveBeenCalled();
  });

  it('O-17: refuses a snapshot whose payload exceeds the byte budget', async () => {
    // `validateBackupPayload` has always accepted a `fileSizeBytes` budget, but
    // this call site never supplied one — the limit existed on paper only.
    const oversized = 'x'.repeat(MAX_BACKUP_FILE_SIZE + 1024);
    vi.spyOn(encryption, 'decryptDataWithPasswordSecure').mockResolvedValueOnce(oversized);
    const replaceSpy = vi.spyOn(storage, 'replaceVaultItems').mockResolvedValue([]);

    await vaultSession.openVaultSession('correct-master-password', 'correct-master-password', new Uint8Array(32));
    await snapshotsLib.createVaultSnapshot('manual', 'oversized');
    const snapshots = await snapshotsLib.getVaultSnapshots();

    await expect(snapshotsLib.restoreVaultSnapshot(snapshots[0]!.id)).rejects.toThrow();

    // Nothing was written.
    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('O-17: refuses a snapshot declaring an implausible item count', async () => {
    // A byte budget alone cannot catch this: many tiny items stay under the cap
    // while still forcing one key derivation and encryption per item.
    const items = Array.from({ length: MAX_RESTORE_ITEM_COUNT + 1 }, (_, index) => ({
      ...sampleItems[0]!,
      id: `item-${index}`,
    }));
    vi.spyOn(encryption, 'decryptDataWithPasswordSecure').mockResolvedValueOnce(
      JSON.stringify({ version: 7, items }),
    );
    const replaceSpy = vi.spyOn(storage, 'replaceVaultItems').mockResolvedValue([]);

    await vaultSession.openVaultSession('correct-master-password', 'correct-master-password', new Uint8Array(32));
    await snapshotsLib.createVaultSnapshot('manual', 'too many');
    const snapshots = await snapshotsLib.getVaultSnapshots();

    await expect(snapshotsLib.restoreVaultSnapshot(snapshots[0]!.id)).rejects.toThrow();

    expect(replaceSpy).not.toHaveBeenCalled();
  });

  it('O-17: accepts a snapshot at exactly the item limit', async () => {
    // Guards against over-correction at the boundary.
    const items = Array.from({ length: MAX_RESTORE_ITEM_COUNT }, (_, index) => ({
      ...sampleItems[0]!,
      id: `item-${index}`,
    }));
    vi.spyOn(encryption, 'decryptDataWithPasswordSecure').mockResolvedValueOnce(
      JSON.stringify({ version: 7, items }),
    );
    vi.spyOn(storage, 'replaceVaultItems').mockResolvedValue(items);

    await vaultSession.openVaultSession('correct-master-password', 'correct-master-password', new Uint8Array(32));
    await snapshotsLib.createVaultSnapshot('manual', 'at limit');
    const snapshots = await snapshotsLib.getVaultSnapshots();

    const outcome = await snapshotsLib.restoreVaultSnapshot(snapshots[0]!.id);

    expect(outcome.restoredItems).toBe(MAX_RESTORE_ITEM_COUNT);
  });
});
