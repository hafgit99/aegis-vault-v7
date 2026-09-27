/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  computeCanonicalStateString,
  computeCanonicalStateStringV1,
  computeStateIntegrityHmac,
  createEmptyVaultDatabaseState,
  deriveVaultHmacKey,
  deriveVaultHmacKeyV1,
  evaluateIntegrityState,
  mayReSignState,
  type VersionedVaultDatabaseState,
} from './vaultDatabaseFormat';

const VAULT_KEY = new Uint8Array(32).fill(7);

function seededState(overrides: Partial<VersionedVaultDatabaseState> = {}): VersionedVaultDatabaseState {
  return {
    ...createEmptyVaultDatabaseState(),
    encryption_salt: 'a'.repeat(32),
    kdfParams: { memoryKiB: 32 * 1024, iterations: 3, parallelism: 1, hashLength: 32 },
    user_secrets: [{ username: 'owner', argon_hash: '$argon2id$v=19$m=32768,t=3,p=1$abc$def' }],
    vault_items: [{
      id: 'item-1',
      title: 'GitHub',
      category: 'login',
      favorite: 0,
      deleted: 0,
      deleted_at: null,
      created_at: '2026-09-26T00:00:00.000Z',
      updated_at: '2026-09-26T00:00:00.000Z',
      username: 'alice',
      username_db: '[encrypted: aes-256-gcm]',
      password_db: '[encrypted: aes-256-gcm]',
      notes_db: '[encrypted: aes-256-gcm]',
      enc_metadata: 'blob',
    }],
    versionCounter: 5,
    ...overrides,
  };
}

/** Produces a state that is correctly sealed at `versionCounter`, v2 style. */
async function sealedState(overrides: Partial<VersionedVaultDatabaseState> = {}) {
  const state = seededState(overrides);
  const hmacKey = await deriveVaultHmacKey(VAULT_KEY);
  state.sealedAtVersionCounter = state.versionCounter ?? 1;
  state.integrityHmac = await computeStateIntegrityHmac(state, hmacKey);
  return state;
}

describe('K-3: integrity sealing and the re-sign rule', () => {
  it('verifies a correctly sealed state and permits re-signing it', async () => {
    const state = await sealedState();
    const verdict = await evaluateIntegrityState(state, VAULT_KEY);

    expect(verdict).toEqual({ status: 'trusted' });
    expect(mayReSignState(verdict)).toBe(true);
  });

  it('detects a deleted row and REFUSES to re-sign (K-3 laundering half)', async () => {
    // The exact finding: the state failed verification, and the next write
    // re-signed it, after which the deletion was indistinguishable from a
    // legitimate edit.
    const state = await sealedState();
    state.vault_items = [];

    const verdict = await evaluateIntegrityState(state, VAULT_KEY);

    expect(verdict.status).toBe('tampered');
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('detects a modified argon_hash and refuses to re-sign', async () => {
    const state = await sealedState();
    state.user_secrets[0]!.argon_hash = '$argon2id$v=19$m=8192,t=1,p=1$attacker$guess';

    const verdict = await evaluateIntegrityState(state, VAULT_KEY);

    expect(verdict.status).toBe('tampered');
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('Y-4: a weakened kdfParams now breaks the signature', async () => {
    // kdfParams used to be outside the signed payload, so dropping it to the
    // enforced floor (8 MiB) left the integrity system reporting "clean" while
    // brute-force cost fell 4x.
    const state = await sealedState();
    state.kdfParams = { memoryKiB: 8192, iterations: 3, parallelism: 1, hashLength: 32 };

    const verdict = await evaluateIntegrityState(state, VAULT_KEY);

    expect(verdict.status).toBe('tampered');
  });

  it('Y-5: deleting kdfParams and encryption_salt no longer skips verification', async () => {
    // The old read path was `integrityHmac && !shouldMigrateStaticSalt &&
    // !shouldMigrateKdf`, so removing both fields made the whole condition
    // false and verification never ran.
    const state = await sealedState();
    delete state.kdfParams;
    delete state.encryption_salt;

    const verdict = await evaluateIntegrityState(state, VAULT_KEY);

    expect(verdict.status).toBe('tampered');
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('rejects a tag that does not match its own sealedAtVersionCounter', async () => {
    const state = await sealedState();
    // Bump the counter after sealing so the tag claims to cover an older
    // generation than the state actually is.
    state.versionCounter = 99;

    const verdict = await evaluateIntegrityState(state, VAULT_KEY);

    expect(verdict.status).toBe('tampered');
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('reports a rollback separately from tampering and still refuses to re-sign', async () => {
    const state = await sealedState({ versionCounter: 3 });
    const hmacKey = await deriveVaultHmacKey(VAULT_KEY);
    state.sealedAtVersionCounter = 3;
    state.integrityHmac = await computeStateIntegrityHmac(state, hmacKey);

    const verdict = await evaluateIntegrityState(state, VAULT_KEY, {
      minVersionCounter: 42,
      tagRequired: true,
    });

    expect(verdict).toEqual({ status: 'rolled-back', loadedVersion: 3, expectedMinVersion: 42 });
    expect(mayReSignState(verdict)).toBe(false);
  });

  it('classifies a pre-v2 state as needing a re-seal, not as tampering', async () => {
    // A database written before kdfParams/sealedAtVersionCounter entered the
    // signed payload must still be usable, otherwise every existing vault
    // would be bricked by this change.
    const state = seededState();
    const v1Key = await deriveVaultHmacKeyV1(VAULT_KEY);
    const { integrityHmac, sealedAtVersionCounter, kdfParams, ...legacy } = state;
    void integrityHmac;
    void sealedAtVersionCounter;
    void kdfParams;

    const legacyState: VersionedVaultDatabaseState = legacy;
    legacyState.integrityHmac = await computeStateIntegrityHmacV1(legacyState, v1Key);

    const verdict = await evaluateIntegrityState(legacyState, VAULT_KEY);

    expect(verdict).toEqual({ status: 'needs-reseal' });
    expect(mayReSignState(verdict)).toBe(true);
  });

  it('does not let a v2 tag be replayed as a v1 tag by stripping the new fields', async () => {
    const state = await sealedState();
    const v1Key = await deriveVaultHmacKeyV1(VAULT_KEY);
    const v2Tag = state.integrityHmac!;

    // Attacker removes the fields that v2 covers, keeping only the v2 tag.
    delete state.kdfParams;
    delete state.sealedAtVersionCounter;
    state.integrityHmac = v2Tag;

    const legacyTag = await computeStateIntegrityHmacV1(state, v1Key);
    expect(legacyTag).not.toBe(v2Tag);
    expect((await evaluateIntegrityState(state, VAULT_KEY)).status).toBe('tampered');
  });

  it('treats an unsigned state as re-signable, since there is nothing to contradict', async () => {
    const state = seededState();
    delete state.integrityHmac;

    const verdict = await evaluateIntegrityState(state, VAULT_KEY);

    expect(verdict).toEqual({ status: 'unsigned' });
    expect(mayReSignState(verdict)).toBe(true);
  });

  it('never reports a state signed under a different vault key as trusted', async () => {
    const state = await sealedState();
    const otherKey = new Uint8Array(32).fill(9);

    const verdict = await evaluateIntegrityState(state, otherKey);

    expect(verdict.status).toBe('tampered');
  });

  it('keeps the v1 and v2 canonical strings genuinely different', () => {
    const state = seededState();
    expect(computeCanonicalStateString(state)).not.toBe(computeCanonicalStateStringV1(state));
  });

  it('binds kdfParams and sealedAtVersionCounter into the signed payload', () => {
    const base = seededState();
    const before = computeCanonicalStateString(base);

    const weaker = seededState();
    weaker.kdfParams = { memoryKiB: 8192, iterations: 3, parallelism: 1, hashLength: 32 };
    expect(computeCanonicalStateString(weaker)).not.toBe(before);

    const bumped = seededState({ versionCounter: 6 });
    bumped.sealedAtVersionCounter = 6;
    expect(computeCanonicalStateString(bumped)).not.toBe(
      computeCanonicalStateString(seededState({ versionCounter: 6 })),
    );
  });
});

/** Signs with the v1 canonical string, the way pre-K-3 builds did. */
async function computeStateIntegrityHmacV1(
  state: VersionedVaultDatabaseState,
  v1Key: Uint8Array,
): Promise<string> {
  const data = new TextEncoder().encode(computeCanonicalStateStringV1(state));
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    v1Key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
