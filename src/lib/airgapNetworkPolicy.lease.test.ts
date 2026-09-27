/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireSyncOriginLease,
  getLeasedSyncOriginCount,
  getSyncAllowedOrigins,
  getSyncOriginLeaseCount,
  isNetworkUrlAllowed,
} from './airgapNetworkPolicy';

const ORIGIN = 'https://dav.example.com';

/** Releases every lease this module handed out, so tests cannot leak into each other. */
const issued: Array<() => void> = [];

function lease(origin: string): () => void {
  const release = acquireSyncOriginLease(origin);
  issued.push(release);
  return release;
}

afterEach(() => {
  while (issued.length > 0) {
    issued.pop()?.();
  }
});

describe('O-21 air-gap origin leases', () => {
  it('whitelists an origin while a lease is held', () => {
    lease(ORIGIN);

    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(true);
    expect(isNetworkUrlAllowed(`${ORIGIN}/AegisVault/vault.aegis`)).toBe(true);
  });

  it('revokes the origin when the last lease is released', () => {
    // The regression: `handleSyncTest` added the origin and never removed it, so
    // a tested server kept network access for the rest of the session.
    const release = lease(ORIGIN);
    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(true);

    release();

    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(false);
    expect(isNetworkUrlAllowed(`${ORIGIN}/AegisVault/vault.aegis`)).toBe(false);
  });

  it('keeps the origin whitelisted while another lease is still live', () => {
    // Reference counting is the whole point: two providers on the same server
    // must not revoke each other.
    const first = lease(ORIGIN);
    const second = lease(ORIGIN);
    expect(getSyncOriginLeaseCount(ORIGIN)).toBe(2);

    first();
    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(true);

    second();
    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(false);
  });

  it('counts concurrent leases on the same origin', () => {
    lease(ORIGIN);
    lease(ORIGIN);
    lease(ORIGIN);

    expect(getSyncOriginLeaseCount(ORIGIN)).toBe(3);
    expect(getLeasedSyncOriginCount()).toBe(1);
  });

  it('tracks distinct origins separately', () => {
    lease(ORIGIN);
    lease('https://s3.example.com');

    expect(getLeasedSyncOriginCount()).toBe(2);
    expect(getSyncOriginLeaseCount(ORIGIN)).toBe(1);
    expect(getSyncOriginLeaseCount('https://s3.example.com')).toBe(1);
  });

  it('ignores a repeated release so a double dispose cannot revoke a live lease', () => {
    // A double `dispose()` must not decrement a lease it no longer owns, or it
    // would silently cut off another provider pointing at the same server.
    const first = lease(ORIGIN);
    const second = lease(ORIGIN);

    first();
    first();
    first();

    expect(getSyncOriginLeaseCount(ORIGIN)).toBe(1);
    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(true);

    second();
    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(false);
  });

  it('normalises the origin so equivalent URLs share one lease', () => {
    lease(`${ORIGIN}/`);
    lease(ORIGIN);

    expect(getSyncOriginLeaseCount(ORIGIN)).toBe(2);
  });

  it('returns a no-op release for a malformed origin and whitelists nothing', () => {
    const release = acquireSyncOriginLease('not a url');

    expect(() => release()).not.toThrow();
    expect(getLeasedSyncOriginCount()).toBe(0);
  });

  it('refuses to whitelist a plaintext non-local origin', () => {
    // The pre-existing scheme check must still apply through the lease path.
    lease('http://insecure.example.com');

    expect(getSyncAllowedOrigins().has('http://insecure.example.com')).toBe(false);
    expect(isNetworkUrlAllowed('http://insecure.example.com/x')).toBe(false);
  });

  it('allows plaintext loopback, matching the existing policy', () => {
    lease('http://localhost:8080');

    expect(getSyncAllowedOrigins().has('http://localhost:8080')).toBe(true);
  });

  it('repeated acquire/release cycles do not accumulate state', () => {
    for (let i = 0; i < 25; i += 1) {
      const release = acquireSyncOriginLease(`${ORIGIN}`);
      release();
    }

    expect(getLeasedSyncOriginCount()).toBe(0);
    expect(getSyncAllowedOrigins().has(ORIGIN)).toBe(false);
  });

  it('twenty distinct test targets do not stay whitelisted forever', async () => {
    // The end-to-end shape of the leak: clicking "Test connection" against many
    // servers used to leave every one of them able to reach the network.
    for (let i = 0; i < 20; i += 1) {
      const release = acquireSyncOriginLease(`https://server-${i}.example.com`);
      expect(getSyncAllowedOrigins().has(`https://server-${i}.example.com`)).toBe(true);
      release();
    }

    expect(getLeasedSyncOriginCount()).toBe(0);
    expect(getSyncAllowedOrigins().size).toBe(0);
    for (let i = 0; i < 20; i += 1) {
      expect(isNetworkUrlAllowed(`https://server-${i}.example.com/AegisVault/vault.aegis`)).toBe(false);
    }
  });
});
