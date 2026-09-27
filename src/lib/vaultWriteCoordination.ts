/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { readVaultIntegrityLedger, recordVaultSeal } from './vaultIntegrityLedger';

/**
 * Y-15: cross-tab write coordination.
 *
 * The vault is a single blob rewritten in full on every save, and every tab
 * keeps its own in-memory copy in a module singleton. With no coordination at
 * all, two tabs produce silent lost updates:
 *
 *   - tab A loads versionCounter 10, tab B loads versionCounter 10
 *   - tab A adds a credential and saves -> 11
 *   - tab B (holding a snapshot from 10) adds a different credential and saves
 *     -> 12, containing B's view: **A's credential is gone**, and the vault
 *     reports success.
 *
 * `navigator.locks` alone does not fix this. Serialising the writes stops them
 * from interleaving, but tab B still rewrites the whole blob from a stale
 * in-memory copy. The fix therefore has two independent parts:
 *
 *   1. **Serialise** writes, so two tabs never write at the same time.
 *   2. **Detect** a stale baseline, and refuse the write. This is the part that
 *      actually prevents data loss.
 *
 * A legitimate write from another tab produces a *valid* HMAC, so the K-3/Y-5
 * integrity gate cannot see it — that gate exists to catch tampering, not
 * concurrency. Only a baseline comparison can.
 */

const VAULT_WRITE_LOCK_NAME = 'aegis-vault-write';
const VAULT_COMMIT_CHANNEL = 'aegis-vault';

/** Why a write was refused. Distinct so the UI can explain the real problem. */
export const vaultWriteConflictCodes = {
  /** Another tab committed after this tab loaded; our snapshot is stale. */
  staleBaseline: 'vault-write-stale-baseline',
} as const;

export type VaultWriteConflictCode =
  (typeof vaultWriteConflictCodes)[keyof typeof vaultWriteConflictCodes];

/** Thrown instead of silently clobbering a newer vault written by another tab. */
export class VaultWriteConflictError extends Error {
  readonly code: VaultWriteConflictCode;
  readonly baselineVersion: number;
  readonly currentVersion: number;

  constructor(code: VaultWriteConflictCode, baselineVersion: number, currentVersion: number) {
    super(`${code}:${baselineVersion}:${currentVersion}`);
    this.name = 'VaultWriteConflictError';
    this.code = code;
    this.baselineVersion = baselineVersion;
    this.currentVersion = currentVersion;
  }
}

export function isVaultWriteConflictError(err: unknown): err is VaultWriteConflictError {
  return err instanceof VaultWriteConflictError
    || (err instanceof Error && err.message.startsWith('vault-write-stale-baseline:'));
}

/**
 * In-process fallback for `withVaultWriteLock`.
 *
 * Only serialises writes inside this one JS context. It cannot help across tabs,
 * which is exactly why the stale-baseline check in `assertFreshWriteBaseline`
 * exists and is not optional.
 */
let inProcessWriteChain: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` with exclusive access to vault writes.
 *
 * Uses `navigator.locks` when available (the only mechanism that actually spans
 * tabs), and an in-process promise chain otherwise. The caller must still verify
 * its baseline: mutual exclusion is not freshness.
 */
export async function withVaultWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as Navigator | undefined)?.locks;
  if (locks && typeof locks.request === 'function') {
    // `ifAvailable: false` is the default: wait for the lock rather than failing,
    // because two tabs saving at once is normal, not exceptional.
    return locks.request(VAULT_WRITE_LOCK_NAME, { mode: 'exclusive' }, async () => fn()) as Promise<T>;
  }

  const run = inProcessWriteChain.then(fn, fn);
  inProcessWriteChain = run.catch(() => undefined);
  return run;
}

/**
 * Refuses a write whose baseline is older than the durable high-water mark.
 *
 * @param baselineVersion the `versionCounter` this tab loaded, i.e. the newest
 * version its in-memory copy is known to include. `null` when there is no prior
 * persisted state (fresh setup), where nothing can contradict us.
 */
export function assertFreshWriteBaseline(baselineVersion: number | null | undefined): void {
  if (typeof baselineVersion !== 'number' || !Number.isFinite(baselineVersion)) {
    return;
  }

  const durableMark = readVaultIntegrityLedger()?.highestVersionCounter ?? 0;
  if (durableMark > baselineVersion) {
    throw new VaultWriteConflictError(
      vaultWriteConflictCodes.staleBaseline,
      baselineVersion,
      durableMark,
    );
  }
}

/** Records the seal and tells other tabs a newer version is available. */
export function announceVaultCommit(versionCounter: number): void {
  if (versionCounter > 0) {
    recordVaultSeal(versionCounter);
  }
  broadcastVaultCommit(versionCounter);
}

function getCommitChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(VAULT_COMMIT_CHANNEL);
  } catch {
    return null;
  }
}

/**
 * Announces a successful commit to other tabs.
 *
 * Best effort: a tab that misses the message still cannot lose data, because
 * `assertFreshWriteBaseline` catches the stale write on its next save.
 */
export function broadcastVaultCommit(versionCounter: number): void {
  const channel = getCommitChannel();
  if (!channel) return;
  try {
    channel.postMessage({ type: 'commit', versionCounter });
  } catch {
    /* a closed channel must never break a save that already succeeded */
  } finally {
    channel.close();
  }
}

export interface VaultCommitListener {
  (versionCounter: number): void;
}

/**
 * Subscribes to commits from other tabs.
 *
 * @returns an unsubscribe function. Listeners must be cheap: they run on the
 * committing tab's event loop, not the writer's.
 */
export function subscribeVaultCommits(listener: VaultCommitListener): () => void {
  const channel = getCommitChannel();
  if (!channel) return () => undefined;

  const handler = (event: MessageEvent) => {
    const data = event.data as { type?: unknown; versionCounter?: unknown } | null;
    if (!data || data.type !== 'commit') return;
    if (typeof data.versionCounter !== 'number') return;
    listener(data.versionCounter);
  };

  channel.addEventListener('message', handler);
  return () => {
    channel.removeEventListener('message', handler);
    channel.close();
  };
}

/**
 * Highest `versionCounter` this tab can see, from the durable ledger.
 *
 * Exposed for the UI so it can tell the user a reload is required.
 */
export function getDurableVaultVersion(): number {
  return readVaultIntegrityLedger()?.highestVersionCounter ?? 0;
}
