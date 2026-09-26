/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Y-5 — the two bypasses that needed evidence held OUTSIDE the vault file:
 *
 *  1. **Tag blanking.** `integrityHmac` deleted from the file, so the next
 *     write sealed whatever the attacker left behind. With the ledger saying
 *     "this vault has been sealed", a missing tag is now `tampered`.
 *
 *  2. **Rollback across a restart.** The high-water mark used to be module
 *     state, so replaying an old database file and restarting reset it to zero
 *     and the replay looked like a first run. It is now on disk.
 */

import { describe, expect, it } from 'vitest';

import {
  computeStateIntegrityHmac,
  createEmptyVaultDatabaseState,
  deriveVaultHmacKey,
  evaluateIntegrityState,
  mayReSignState,
  NO_INTEGRITY_EXPECTATIONS,
  type IntegrityExpectations,
  type VersionedVaultDatabaseState,
} from './vaultDatabaseFormat';

const VAULT_KEY = new Uint8Array(32).fill(11);

const SEALED: IntegrityExpectations = { minVersionCounter: 0, tagRequired: true };

function stateWithCounter(versionCounter: number): VersionedVaultDatabaseState {
  return {
    ...createEmptyVaultDatabaseState(),
    encryption_salt: 'b'.repeat(32),
    kdfParams: { memoryKiB: 32 * 1024, iterations: 3, parallelism: 1, hashLength: 32 },
    user_secrets: [{ username: 'owner', argon_hash: '$argon2id$v=19$m=32768,t=3,p=1$x$y' }],
    vault_items: [],
    versionCounter,
  };
}

async function seal(state: VersionedVaultDatabaseState): Promise<VersionedVaultDatabaseState> {
  const hmacKey = await deriveVaultHmacKey(VAULT_KEY);
  state.sealedAtVersionCounter = state.versionCounter ?? 1;
  state.integrityHmac = await computeStateIntegrityHmac(state, hmacKey);
  return state;
}

describe('Y-5: tag blanking', () => {
  it('rejects a blanked tag once the ledger says the vault was sealed', async () => {
    const state = await seal(stateWithCounter(9));
    delete state.integrityHmac;

    const verdict = await evaluateIntegrityState(state, VAULT_KEY, SEALED);

    expect(verdict.status).toBe('tampered');
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('rejects a blanked tag even when the counter is far above the mark', async () => {
    // An attacker can bump `versionCounter` to look "newer"; the tag is still
    // the thing that proves anything.
    const state = await seal(stateWithCounter(9));
    delete state.integrityHmac;
    state.versionCounter = 9999;
    state.sealedAtVersionCounter = 9999;

    const verdict = await evaluateIntegrityState(state, VAULT_KEY, {
      minVersionCounter: 5,
      tagRequired: true,
    });

    expect(verdict.status).toBe('tampered');
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('still allows a genuinely fresh vault with no expectations recorded', async () => {
    // A brand-new vault (or one created before the ledger existed) has no tag
    // and no evidence that it should. This is the path that must not break.
    const state = stateWithCounter(1);

    const verdict = await evaluateIntegrityState(state, VAULT_KEY, NO_INTEGRITY_EXPECTATIONS);

    expect(verdict).toEqual({ status: 'unsigned' });
    expect(mayReSignState(verdict)).toBe(true);
  });

  it('does not let a pre-ledger vault be re-opened as unsealed once sealed', async () => {
    // Sanity check on the ordering: the tag check runs before anything else,
    // so a state with a VALID tag is trusted even under sealed expectations.
    const state = await seal(stateWithCounter(4));

    expect((await evaluateIntegrityState(state, VAULT_KEY, SEALED)).status).toBe('trusted');
  });
});

describe('Y-5: rollback detected from a durable mark', () => {
  it('rejects a replayed older file using only the on-disk mark', async () => {
    // The state verifies cryptographically — it is a genuine, untampered file.
    // What makes it unacceptable is that it is OLDER than what this
    // installation already sealed.
    const replayed = await seal(stateWithCounter(6));

    const verdict = await evaluateIntegrityState(replayed, VAULT_KEY, {
      minVersionCounter: 21,
      tagRequired: true,
    });

    expect(verdict).toEqual({ status: 'rolled-back', loadedVersion: 6, expectedMinVersion: 21 });
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('accepts a file exactly at the mark', async () => {
    const state = await seal(stateWithCounter(21));

    const verdict = await evaluateIntegrityState(state, VAULT_KEY, {
      minVersionCounter: 21,
      tagRequired: true,
    });

    expect(verdict.status).toBe('trusted');
  });

  it('accepts a file above the mark', async () => {
    const state = await seal(stateWithCounter(22));

    const verdict = await evaluateIntegrityState(state, VAULT_KEY, {
      minVersionCounter: 21,
      tagRequired: true,
    });

    expect(verdict.status).toBe('trusted');
  });

  it('a zero mark imposes no floor, so nothing is falsely rejected', async () => {
    const state = await seal(stateWithCounter(1));

    expect((await evaluateIntegrityState(state, VAULT_KEY, {
      minVersionCounter: 0,
      tagRequired: false,
    })).status).toBe('trusted');
  });
});
