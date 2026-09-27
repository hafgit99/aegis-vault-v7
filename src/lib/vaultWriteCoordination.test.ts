/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readVaultIntegrityLedger = vi.hoisted(() => vi.fn((): any => null));
const recordVaultSeal = vi.hoisted(() => vi.fn((versionCounter: number) => ({
  appId: 'aegis-vault-db',
  sealed: true,
  highestVersionCounter: versionCounter,
  sealedAt: new Date().toISOString(),
})));

vi.mock('./vaultIntegrityLedger', () => ({
  readVaultIntegrityLedger,
  recordVaultSeal,
}));

import {
  announceVaultCommit,
  assertFreshWriteBaseline,
  broadcastVaultCommit,
  getDurableVaultVersion,
  isVaultWriteConflictError,
  subscribeVaultCommits,
  VaultWriteConflictError,
  vaultWriteConflictCodes,
  withVaultWriteLock,
} from './vaultWriteCoordination';

/** Minimal in-process BroadcastChannel stand-in; jsdom has none. */
class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = [];
  private listeners = new Set<(event: MessageEvent) => void>();
  posted: unknown[] = [];
  closed = false;

  constructor(public readonly name: string) {
    FakeBroadcastChannel.instances.push(this);
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }

  postMessage(data: unknown) {
    if (this.closed) return;
    this.posted.push(data);
    // Every other live channel of the same name receives it.
    for (const peer of FakeBroadcastChannel.instances) {
      if (peer === this || peer.closed || peer.name !== this.name) continue;
      for (const listener of peer.listeners) {
        listener({ data } as MessageEvent);
      }
    }
  }

  close() {
    this.closed = true;
    this.listeners.clear();
  }
}

describe('vaultWriteCoordination (Y-15)', () => {
  beforeEach(() => {
    readVaultIntegrityLedger.mockReturnValue(null);
    recordVaultSeal.mockClear();
    FakeBroadcastChannel.instances = [];
    (globalThis as any).BroadcastChannel = FakeBroadcastChannel;
    delete (globalThis.navigator as any).locks;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('assertFreshWriteBaseline', () => {
    it('allows a write whose baseline matches the durable mark', () => {
      readVaultIntegrityLedger.mockReturnValue({ highestVersionCounter: 10 });

      expect(() => assertFreshWriteBaseline(10)).not.toThrow();
    });

    it('allows a write that advances the version', () => {
      readVaultIntegrityLedger.mockReturnValue({ highestVersionCounter: 10 });

      expect(() => assertFreshWriteBaseline(9 + 1)).not.toThrow();
    });

    it('refuses a write based on a stale snapshot', () => {
      // The core Y-15 regression: another tab committed 12, this tab still
      // holds a copy from 10. Writing would silently discard version 12.
      readVaultIntegrityLedger.mockReturnValue({ highestVersionCounter: 12 });

      expect(() => assertFreshWriteBaseline(10)).toThrow(VaultWriteConflictError);
      try {
        assertFreshWriteBaseline(10);
      } catch (err) {
        expect(isVaultWriteConflictError(err)).toBe(true);
        expect((err as VaultWriteConflictError).code).toBe(vaultWriteConflictCodes.staleBaseline);
        expect((err as VaultWriteConflictError).baselineVersion).toBe(10);
        expect((err as VaultWriteConflictError).currentVersion).toBe(12);
      }
    });

    it('allows a first write with no prior persisted state', () => {
      readVaultIntegrityLedger.mockReturnValue({ highestVersionCounter: 12 });

      expect(() => assertFreshWriteBaseline(null)).not.toThrow();
      expect(() => assertFreshWriteBaseline(undefined)).not.toThrow();
    });

    it('allows a write when no ledger exists yet', () => {
      readVaultIntegrityLedger.mockReturnValue(null);

      expect(() => assertFreshWriteBaseline(5)).not.toThrow();
    });

    it('allows a non-numeric baseline rather than guessing', () => {
      readVaultIntegrityLedger.mockReturnValue({ highestVersionCounter: 99 });

      expect(() => assertFreshWriteBaseline(Number.NaN)).not.toThrow();
      expect(() => assertFreshWriteBaseline(Number.POSITIVE_INFINITY)).not.toThrow();
    });
  });

  describe('withVaultWriteLock', () => {
    it('serialises concurrent writes in a single context', async () => {
      // No navigator.locks: the in-process fallback must still not interleave.
      const order: string[] = [];
      let releaseFirst: () => void = () => undefined;

      const first = withVaultWriteLock(async () => {
        order.push('first-start');
        await new Promise<void>((resolve) => { releaseFirst = resolve; });
        order.push('first-end');
      });
      const second = withVaultWriteLock(async () => {
        order.push('second-start');
      });

      // Give the first write a chance to take the lock.
      await Promise.resolve();
      expect(order).toEqual(['first-start']);

      releaseFirst();
      await Promise.all([first, second]);

      expect(order).toEqual(['first-start', 'first-end', 'second-start']);
    });

    it('uses navigator.locks when available', async () => {
      const request = vi.fn(async (_name: string, _opts: unknown, cb: () => Promise<unknown>) => cb());
      (globalThis.navigator as any).locks = { request };

      const result = await withVaultWriteLock(async () => 'done');

      expect(request).toHaveBeenCalledWith('aegis-vault-write', { mode: 'exclusive' }, expect.any(Function));
      expect(result).toBe('done');
    });

    it('does not run the body twice when the previous write rejected', async () => {
      let ran = 0;
      await expect(withVaultWriteLock(async () => { throw new Error('first failed'); })).rejects.toThrow('first failed');

      await withVaultWriteLock(async () => { ran += 1; });

      // A rejected predecessor must not poison the chain.
      expect(ran).toBe(1);
    });
  });

  describe('commit announcements', () => {
    it('raises the durable mark and broadcasts the version', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeVaultCommits(listener);

      announceVaultCommit(17);

      expect(recordVaultSeal).toHaveBeenCalledWith(17);
      // The other tab is told, so it can refresh or refuse a stale write.
      expect(listener).toHaveBeenCalledWith(17);
      unsubscribe();
    });

    it('does not raise the mark for version 0', () => {
      announceVaultCommit(0);

      expect(recordVaultSeal).not.toHaveBeenCalled();
    });

    it('notifies other tabs of a commit', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeVaultCommits(listener);

      // A different tab commits.
      new FakeBroadcastChannel('aegis-vault').postMessage({ type: 'commit', versionCounter: 21 });

      expect(listener).toHaveBeenCalledWith(21);
      unsubscribe();
    });

    it('stops notifying after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeVaultCommits(listener);
      unsubscribe();

      new FakeBroadcastChannel('aegis-vault').postMessage({ type: 'commit', versionCounter: 22 });

      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores messages that are not commits', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeVaultCommits(listener);

      const other = new FakeBroadcastChannel('aegis-vault');
      other.postMessage({ type: 'something-else', versionCounter: 5 });
      other.postMessage({ type: 'commit', versionCounter: 'not-a-number' });
      other.postMessage(null);
      other.postMessage(undefined);

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('ignores channels with a different name', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeVaultCommits(listener);

      new FakeBroadcastChannel('some-other-channel').postMessage({ type: 'commit', versionCounter: 9 });

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('degrades quietly when BroadcastChannel is unavailable', () => {
      delete (globalThis as any).BroadcastChannel;
      const listener = vi.fn();

      expect(() => broadcastVaultCommit(5)).not.toThrow();
      expect(() => subscribeVaultCommits(listener)()).not.toThrow();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('getDurableVaultVersion', () => {
    it('reports the durable mark', () => {
      readVaultIntegrityLedger.mockReturnValue({ highestVersionCounter: 31 });

      expect(getDurableVaultVersion()).toBe(31);
    });

    it('reports 0 without a ledger', () => {
      readVaultIntegrityLedger.mockReturnValue(null);

      expect(getDurableVaultVersion()).toBe(0);
    });
  });
});
