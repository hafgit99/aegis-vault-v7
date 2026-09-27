// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { VersionedVaultDatabaseState } from './vaultDatabaseFormat';
import type * as SQLiteOpfsPersistenceModule from './sqliteOpfsPersistence';
import type * as IndexedDbModuleType from './indexedDbStorage';

/**
 * O-2.
 *
 * Each test re-imports the modules with `vi.resetModules()`. The staleness
 * signal deliberately lives in module state (a quota-exhausted origin cannot be
 * relied on to persist a marker), so the module boundary *is* the isolation
 * boundary here. Resetting modules keeps that state from leaking between tests
 * without adding a test-only reset hook to production code.
 */
type PersistenceModule = typeof SQLiteOpfsPersistenceModule;
type IndexedDbModule = typeof IndexedDbModuleType;

let persistence: PersistenceModule;
let indexedDb: IndexedDbModule;

function state(versionCounter: number): VersionedVaultDatabaseState {
  return {
    schemaVersion: 1,
    appId: 'aegis-vault-v7',
    user_secrets: [],
    vault_items: [],
    versionCounter,
  } as VersionedVaultDatabaseState;
}

/**
 * Makes localStorage throw for the given keys, as a full quota would.
 *
 * `exhaustQuotaForMirror()` fails only the big payload, which is the realistic
 * case. `exhaustQuotaEntirely()` additionally fails the tiny version record,
 * which is the pathological "not one more byte" case where the version
 * comparison has nothing to compare and only the in-memory signal is left.
 */
function failWritesFor(...keys: string[]): void {
  const realSetItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (keys.includes(key)) throw new DOMException('quota', 'QuotaExceededError');
    return realSetItem.call(this, key, value);
  });
}

function exhaustQuotaForMirror(): void {
  failWritesFor(persistence.LOCAL_FALLBACK_KEY);
}

describe('O-2 local fallback mirror staleness', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    localStorage.clear();
    persistence = await import('./sqliteOpfsPersistence');
    indexedDb = await import('./indexedDbStorage');
  });

  it('reports a fresh mirror as current', () => {
    persistence.writeLocalFallbackMirror(state(4), JSON.stringify(state(4)), false);

    const status = persistence.inspectLocalFallbackMirror();
    expect(status.present).toBe(true);
    expect(status.stale).toBe(false);
    expect(status.version).toBe(4);
  });

  it('records the mirror version before writing the payload', () => {
    persistence.writeLocalFallbackMirror(state(7), JSON.stringify(state(7)), false);

    const meta = JSON.parse(
      localStorage.getItem(persistence.LOCAL_FALLBACK_META_KEY)!,
    );
    expect(meta.version).toBe(7);
    expect(
      JSON.parse(localStorage.getItem(persistence.LOCAL_FALLBACK_KEY)!).versionCounter,
    ).toBe(7);
  });

  it('detects a mirror left behind by a swallowed write', () => {
    // The actual finding: the payload write fails, nothing says so, and the
    // "recovery mirror" quietly keeps an older vault.
    persistence.writeLocalFallbackMirror(state(2), JSON.stringify(state(2)), false);

    exhaustQuotaForMirror();
    // A later save records version 9, then fails to write the payload. The
    // mirror still holds version 2.
    persistence.writeLocalFallbackMirror(state(9), JSON.stringify(state(9)), false);
    vi.restoreAllMocks();

    expect(
      JSON.parse(localStorage.getItem(persistence.LOCAL_FALLBACK_KEY)!).versionCounter,
    ).toBe(2);

    const status = persistence.inspectLocalFallbackMirror();
    expect(status.stale).toBe(true);
    expect(status.reason).toBe('version-behind');
    expect(status.version).toBe(2);
    expect(status.expectedVersion).toBe(9);
  });

  it('still detects a stale mirror after a restart, with no in-memory signal left', async () => {
    // Detection has to survive a reload, because a reload is exactly when a
    // stale mirror is dangerous: the user comes back, the authoritative store is
    // unavailable, and the mirror is what they get. The in-memory failure signal
    // is gone at that point, so this asserts the persisted version record alone
    // is enough.
    //
    // What this does *not* pin is the order of the two writes. I tried moving the
    // record write after the payload write and this test still passed -- when the
    // record write succeeds, the mismatch is detected either way. The ordering
    // only matters for a process death between the two writes, which is not
    // something a test can provoke, so it is argued in a comment rather than
    // claimed as covered.
    persistence.writeLocalFallbackMirror(state(2), JSON.stringify(state(2)), false);
    exhaustQuotaForMirror();
    persistence.writeLocalFallbackMirror(state(9), JSON.stringify(state(9)), false);
    vi.restoreAllMocks();

    expect(
      JSON.parse(localStorage.getItem(persistence.LOCAL_FALLBACK_KEY)!).versionCounter,
    ).toBe(2);

    // Fresh module: the in-memory flag is gone, exactly as after a reload.
    vi.resetModules();
    const afterRestart = await import('./sqliteOpfsPersistence');

    const status = afterRestart.inspectLocalFallbackMirror();
    expect(status.stale).toBe(true);
    expect(status.reason).toBe('version-behind');
    expect(status.version).toBe(2);
    expect(status.expectedVersion).toBe(9);
  });

  it('flags the swallowed write itself when the version record could not land', () => {
    // Quota exhausted to the last byte: even the tiny record fails, so the
    // version comparison has nothing to compare. The in-memory failure signal is
    // the only thing left -- which is why it is a best-effort layer on top of
    // the version check rather than the foundation.
    failWritesFor(persistence.LOCAL_FALLBACK_KEY, persistence.LOCAL_FALLBACK_META_KEY);
    persistence.writeLocalFallbackMirror(state(3), JSON.stringify(state(3)), false);
    vi.restoreAllMocks();

    expect(localStorage.getItem(persistence.LOCAL_FALLBACK_META_KEY)).toBeNull();

    const status = persistence.inspectLocalFallbackMirror();
    expect(status.stale).toBe(true);
    expect(status.reason).toBe('write-failed');
  });

  it('recovers once a later write succeeds', () => {
    exhaustQuotaForMirror();
    persistence.writeLocalFallbackMirror(state(3), JSON.stringify(state(3)), false);
    vi.restoreAllMocks();
    expect(persistence.inspectLocalFallbackMirror().stale).toBe(true);

    // A later save lands, so the mirror is current again and must stop warning.
    // Otherwise one transient quota error would nag the user for ever.
    persistence.writeLocalFallbackMirror(state(4), JSON.stringify(state(4)), false);

    const status = persistence.inspectLocalFallbackMirror();
    expect(status.stale).toBe(false);
    expect(status.version).toBe(4);
  });

  it('does not report a swallowed write for an unrelated small key', async () => {
    // The vault mirror is the only value in this store big enough to hit the
    // quota. A failed write to a small setup flag is not a stale vault, and the
    // boot-time sync writes all of them in one pass, so this is a real path
    // rather than a synthetic one.
    await indexedDb.setIndexedDbItem('aegis_is_setup', 'true');
    await indexedDb.setIndexedDbItem(
      persistence.LOCAL_FALLBACK_KEY,
      JSON.stringify(state(5)),
    );
    persistence.writeLocalFallbackMirror(state(5), JSON.stringify(state(5)), false);

    failWritesFor('aegis_is_setup');
    await indexedDb.initializeIndexedDbStorage();
    vi.restoreAllMocks();

    // The small flag failed; the mirror refreshed fine.
    expect(persistence.inspectLocalFallbackMirror().stale).toBe(false);
  });

  it('surfaces the condition once per occurrence', () => {
    expect(persistence.consumeVaultFallbackMirrorStale()).toBe(false);

    persistence.markVaultFallbackMirrorStale('write-failed');
    expect(persistence.consumeVaultFallbackMirrorStale()).toBe(true);
    expect(persistence.consumeVaultFallbackMirrorStale()).toBe(false);
  });

  it('raises the alert when a stale mirror is actually used to recover data', () => {
    // The whole point of the finding: the mirror is still used, because when the
    // authoritative store is genuinely gone it is the only copy -- but the user
    // is told it is behind.
    persistence.writeLocalFallbackMirror(state(2), JSON.stringify(state(2)), false);
    exhaustQuotaForMirror();
    persistence.writeLocalFallbackMirror(state(9), JSON.stringify(state(9)), false);
    vi.restoreAllMocks();

    expect(persistence.consumeVaultFallbackMirrorStale()).toBe(false);
    persistence.reportFallbackMirrorRecovery();
    expect(persistence.consumeVaultFallbackMirrorStale()).toBe(true);
  });

  it('says nothing when the mirror used for recovery is current', () => {
    persistence.writeLocalFallbackMirror(state(4), JSON.stringify(state(4)), false);

    persistence.reportFallbackMirrorRecovery();

    expect(persistence.consumeVaultFallbackMirrorStale()).toBe(false);
  });

  it('never lets the staleness report interfere with recovering the vault', () => {
    // A diagnostic that can change what happens to the user's data is not a
    // diagnostic. An earlier version of this check sat inside the `try` guarding
    // the mirror JSON parse, so its failure was swallowed by `catch {}` and the
    // mirror was then never loaded -- a recovery path silently turning into a
    // fresh-setup path.
    expect(persistence.reportFallbackMirrorRecovery()).toBeUndefined();
  });

  it('ignores an unparseable mirror rather than calling it stale', () => {
    // An unreadable mirror is a different problem, handled by the load path.
    // Conflating the two would turn a parse bug into a false "your backup is
    // old" warning.
    localStorage.setItem(persistence.LOCAL_FALLBACK_KEY, '{not json');
    localStorage.setItem(
      persistence.LOCAL_FALLBACK_META_KEY,
      JSON.stringify({ version: 5, writtenAtMs: 1 }),
    );

    const status = persistence.inspectLocalFallbackMirror();
    expect(status.stale).toBe(false);
  });

  it('does not report a mirror that is ahead of the record as stale', () => {
    // The over-correction guard: ">=" instead of "<" would flag a *newer* mirror
    // as stale, which happens legitimately when the record write failed but the
    // payload write succeeded.
    localStorage.setItem(
      persistence.LOCAL_FALLBACK_KEY,
      JSON.stringify(state(9)),
    );
    localStorage.setItem(
      persistence.LOCAL_FALLBACK_META_KEY,
      JSON.stringify({ version: 5, writtenAtMs: 1 }),
    );

    const status = persistence.inspectLocalFallbackMirror();
    expect(status.stale).toBe(false);
    expect(status.version).toBe(9);
  });

  it('ignores a missing mirror instead of claiming a stale one', () => {
    const status = persistence.inspectLocalFallbackMirror();
    expect(status.present).toBe(false);
    expect(status.stale).toBe(false);
  });

  it('remembers a swallowed mirror write until a later one succeeds', () => {
    // The wiring: `indexedDbStorage` must actually record the failure, or the
    // whole chain above is dead code.
    exhaustQuotaForMirror();
    persistence.writeLocalFallbackMirror(state(6), JSON.stringify(state(6)), false);
    vi.restoreAllMocks();

    expect(indexedDb.didLocalMirrorWriteFail(persistence.LOCAL_FALLBACK_KEY)).toBe(true);
    expect(persistence.inspectLocalFallbackMirror().stale).toBe(true);

    // A successful write clears it, so one transient quota error does not mark
    // the mirror forever.
    persistence.writeLocalFallbackMirror(state(7), JSON.stringify(state(7)), false);

    expect(indexedDb.didLocalMirrorWriteFail(persistence.LOCAL_FALLBACK_KEY)).toBe(false);
    expect(persistence.inspectLocalFallbackMirror().stale).toBe(false);
  });

  it('remembers a boot-time IndexedDB sync that could not refresh the mirror', async () => {
    // The second swallow point, and the one that matters most across restarts:
    // on boot the authoritative IndexedDB copy is re-mirrored into localStorage.
    // If that write is swallowed, the localStorage copy is stale from the moment
    // the app starts, with no save in between -- and the version record cannot
    // help, because this path never touches it.
    await indexedDb.setIndexedDbItem(
      persistence.LOCAL_FALLBACK_KEY,
      JSON.stringify(state(11)),
    );
    localStorage.setItem(persistence.LOCAL_FALLBACK_KEY, JSON.stringify(state(3)));

    failWritesFor(persistence.LOCAL_FALLBACK_KEY);
    await indexedDb.initializeIndexedDbStorage();
    vi.restoreAllMocks();

    expect(indexedDb.didLocalMirrorWriteFail(persistence.LOCAL_FALLBACK_KEY)).toBe(true);
    expect(persistence.inspectLocalFallbackMirror().stale).toBe(true);
    // The mirror is untouched, so it still holds the old version.
    expect(
      JSON.parse(localStorage.getItem(persistence.LOCAL_FALLBACK_KEY)!).versionCounter,
    ).toBe(3);
  });

  it('does not treat a swallowed write to a small setup flag as a stale mirror', async () => {
    // The vault mirror is the only value in this store big enough to hit the
    // quota. A failed write to a small setup flag is not a stale vault, and the
    // boot-time sync writes all of them in one pass, so this is a real path
    // rather than a synthetic one.
    await indexedDb.setIndexedDbItem('aegis_is_setup', 'true');
    await indexedDb.setIndexedDbItem(
      persistence.LOCAL_FALLBACK_KEY,
      JSON.stringify(state(5)),
    );
    persistence.writeLocalFallbackMirror(state(5), JSON.stringify(state(5)), false);

    failWritesFor('aegis_is_setup');
    await indexedDb.initializeIndexedDbStorage();
    vi.restoreAllMocks();

    // The small flag failed; the mirror refreshed fine.
    expect(indexedDb.didLocalMirrorWriteFail('aegis_is_setup')).toBe(true);
    expect(indexedDb.didLocalMirrorWriteFail(persistence.LOCAL_FALLBACK_KEY)).toBe(false);
    expect(persistence.inspectLocalFallbackMirror().stale).toBe(false);
  });
});
