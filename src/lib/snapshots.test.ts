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
});
