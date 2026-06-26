/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveLWWConflicts, buildSyncEnvelope, parseSyncEnvelope, performSync } from './syncEngine';
import { SyncProvider, SyncMetadata, SyncConflictItem } from './syncTypes';
import { VaultItem } from '../../types';

// Mock argon2id so tests don't need WASM
vi.mock('../argon2id', () => ({
  deriveArgon2idKey: vi.fn(async (password: string) => {
    const key = new Uint8Array(32);
    for (let i = 0; i < key.length; i++) {
      key[i] = password.charCodeAt(i % password.length) & 0xff;
    }
    return key;
  }),
}));

vi.mock('../legacyCrypto', () => ({
  decryptLegacyDataWithPassword: vi.fn(async () => '[]'),
}));


// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(id: string, updatedAt: string, extra: Partial<VaultItem> = {}): VaultItem {
  return {
    id,
    title: `Item ${id}`,
    username: 'user',
    url: 'https://example.com',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    category: 'login',
    ...extra,
  };
}

const MASTER_PW = 'TestMasterPassword123!';

// ─── LWW Conflict Resolution Tests ───────────────────────────────────────────

describe('resolveLWWConflicts', () => {
  it('keeps local item when local is newer', () => {
    const local = [makeItem('a', '2024-06-01T12:00:00Z', { title: 'Local Title' })];
    const remote = [makeItem('a', '2024-06-01T10:00:00Z', { title: 'Remote Title' })];
    const { merged, conflicts } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')!.title).toBe('Local Title');
    expect(conflicts).toHaveLength(0);
  });

  it('adopts remote item when remote is newer', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z', { title: 'Local Title' })];
    const remote = [makeItem('a', '2024-06-01T12:00:00Z', { title: 'Remote Title' })];
    const { merged, conflicts } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')!.title).toBe('Remote Title');
    expect(conflicts).toHaveLength(0);
  });

  it('adds remote-only items to local', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z')];
    const remote = [makeItem('b', '2024-06-01T11:00:00Z', { title: 'Remote Only' })];
    const { merged } = resolveLWWConflicts(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find(i => i.id === 'b')?.title).toBe('Remote Only');
  });

  it('keeps local-only items untouched', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z'), makeItem('b', '2024-06-01T11:00:00Z')];
    const remote = [makeItem('a', '2024-06-01T09:00:00Z')];
    const { merged } = resolveLWWConflicts(local, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find(i => i.id === 'b')).toBeDefined();
  });

  it('flags near-simultaneous writes as conflicts', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00.000Z', { title: 'Local' })];
    // 2 seconds later — under the 5s threshold
    const remote = [makeItem('a', '2024-06-01T10:00:02.000Z', { title: 'Remote' })];
    const { merged, conflicts } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')!.title).toBe('Remote'); // remote wins
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe('a');
  });

  it('does not flag conflicts for writes > 5s apart', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00.000Z', { title: 'Local' })];
    const remote = [makeItem('a', '2024-06-01T10:00:10.000Z', { title: 'Remote' })];
    const { conflicts } = resolveLWWConflicts(local, remote);
    expect(conflicts).toHaveLength(0);
  });

  it('handles tombstone items correctly (deleted flag propagated)', () => {
    const local = [makeItem('a', '2024-06-01T10:00:00Z')];
    const remote = [makeItem('a', '2024-06-01T12:00:00Z', { deleted: true, deletedAt: '2024-06-01T12:00:00Z' })];
    const { merged } = resolveLWWConflicts(local, remote);
    expect(merged.find(i => i.id === 'a')?.deleted).toBe(true);
  });

  it('handles empty inputs gracefully', () => {
    expect(resolveLWWConflicts([], []).merged).toHaveLength(0);
    const local = [makeItem('a', '2024-01-01T00:00:00Z')];
    expect(resolveLWWConflicts(local, []).merged).toHaveLength(1);
    expect(resolveLWWConflicts([], local).merged).toHaveLength(1);
  });
});

// ─── Envelope Round-Trip Tests ────────────────────────────────────────────────

describe('buildSyncEnvelope / parseSyncEnvelope', () => {
  const items: VaultItem[] = [
    makeItem('x1', '2024-01-01T00:00:00Z', { title: 'Login A', password: 's3cr3t!' }),
    makeItem('x2', '2024-01-02T00:00:00Z', { title: 'Login B', username: 'bob' }),
  ];

  it('produces a valid JSON envelope and recovers items', async () => {
    const { encryptedBlob, metadata } = await buildSyncEnvelope(items, MASTER_PW);
    expect(typeof encryptedBlob).toBe('string');
    expect(metadata.itemCount).toBe(2);
    expect(metadata.checksum).toHaveLength(64); // SHA-256 hex

    const recovered = await parseSyncEnvelope(encryptedBlob, MASTER_PW, metadata.checksum);
    expect(recovered).toHaveLength(2);
    expect(recovered.find(i => i.id === 'x1')?.password).toBe('s3cr3t!');
  });

  it('rejects wrong password', async () => {
    const { encryptedBlob } = await buildSyncEnvelope(items, MASTER_PW);
    await expect(parseSyncEnvelope(encryptedBlob, 'WrongPassword999!')).rejects.toThrow();
  });

  it('rejects mismatched checksum', async () => {
    const { encryptedBlob } = await buildSyncEnvelope(items, MASTER_PW);
    await expect(
      parseSyncEnvelope(encryptedBlob, MASTER_PW, 'a'.repeat(64)),
    ).rejects.toThrow(/checksum/i);
  });
});

// ─── performSync Integration Tests ───────────────────────────────────────────

describe('performSync', () => {
  const makeProvider = (overrides: Partial<SyncProvider> = {}): SyncProvider => ({
    uploadVault: vi.fn().mockResolvedValue(undefined),
    downloadVault: vi.fn().mockResolvedValue(null),
    getRemoteMetadata: vi.fn().mockResolvedValue(null),
    testConnection: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  it('uploads local items when no remote exists', async () => {
    const provider = makeProvider();
    const localItems = [makeItem('a', '2024-01-01T00:00:00Z')];
    const result = await performSync(provider, localItems, MASTER_PW);
    expect(result.status).toBe('success');
    expect(provider.uploadVault).toHaveBeenCalledOnce();
    expect(result.mergedItems).toHaveLength(1);
  });

  it('merges remote items when remote is available', async () => {
    const remoteItem = makeItem('b', '2024-06-01T12:00:00Z', { title: 'Remote Item' });
    const { encryptedBlob, metadata } = await buildSyncEnvelope([remoteItem], MASTER_PW);

    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue(metadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const localItems = [makeItem('a', '2024-01-01T00:00:00Z', { title: 'Local Item' })];
    const result = await performSync(provider, localItems, MASTER_PW);

    expect(result.status).toBe('success');
    expect(result.mergedItems).toHaveLength(2);
    expect(result.mergedItems?.find(i => i.id === 'b')?.title).toBe('Remote Item');
  });

  it('returns error status on upload failure', async () => {
    const provider = makeProvider({
      uploadVault: vi.fn().mockRejectedValue(new Error('HTTP 503')),
    });
    const result = await performSync(provider, [], MASTER_PW);
    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
  });

  it('returns error status on download failure', async () => {
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue({
        updatedAt: '2099-01-01T00:00:00Z', // future — triggers download
        deviceId: 'remote-device',
        vaultVersion: '7.0',
        checksum: 'a'.repeat(64),
        itemCount: 1,
      } as SyncMetadata),
      downloadVault: vi.fn().mockRejectedValue(new Error('Network error')),
    });
    const result = await performSync(provider, [], MASTER_PW);
    expect(result.status).toBe('error');
  });

  it('returns conflict status on near-simultaneous writes', async () => {
    const now = new Date();
    const oneSecondAgo = new Date(now.getTime() - 1000);
    const localItems = [makeItem('a', now.toISOString(), { title: 'Local' })];
    const remoteItems = [makeItem('a', oneSecondAgo.toISOString(), { title: 'Remote Older' })];
    // Make remote item have a slightly newer timestamp than local for conflict
    remoteItems[0].updatedAt = new Date(now.getTime() + 500).toISOString();
    remoteItems[0].title = 'Remote Newer';

    const { encryptedBlob, metadata } = await buildSyncEnvelope(remoteItems, MASTER_PW);
    const provider = makeProvider({
      getRemoteMetadata: vi.fn().mockResolvedValue(metadata),
      downloadVault: vi.fn().mockResolvedValue(encryptedBlob),
    });

    const result = await performSync(provider, localItems, MASTER_PW);
    expect(result.status).toBe('conflict');
    expect(result.conflicts?.length).toBeGreaterThan(0);
  });
});
