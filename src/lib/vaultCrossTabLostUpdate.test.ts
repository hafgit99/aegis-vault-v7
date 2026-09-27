/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  clearVaultIntegrityLedger: vi.fn(),
  VAULT_INTEGRITY_LEDGER_KEY: 'aegis_vault_integrity_ledger',
}));

import {
  assertFreshWriteBaseline,
  getDurableVaultVersion,
  isVaultWriteConflictError,
  VaultWriteConflictError,
  vaultWriteConflictCodes,
} from './vaultWriteCoordination';

/**
 * Y-15: the two-tab lost update, modelled directly.
 *
 * The vault is a whole-blob rewrite and each tab holds its own in-memory copy.
 * Before this finding, a second tab saving over a newer first-tab write silently
 * discarded the first tab's credential while reporting success. These tests
 * pin the property that prevents it.
 */
describe('cross-tab lost update (Y-15)', () => {
  beforeEach(() => {
    readVaultIntegrityLedger.mockReturnValue(null);
    recordVaultSeal.mockClear();
  });

  /** Models another tab committing successfully. */
  function announceCommit(versionCounter: number) {
    recordVaultSeal(versionCounter);
    readVaultIntegrityLedger.mockReturnValue({ highestVersionCounter: versionCounter });
  }

  it('refuses the stale second write instead of discarding the first tab work', () => {
    // Both tabs load version 10.
    const tabABaseline = 10;
    const tabBBaseline = 10;

    // Tab A saves first: its commit raises the durable mark to 11.
    announceCommit(11);
    expect(() => assertFreshWriteBaseline(tabABaseline + 1)).not.toThrow();

    // Tab B, still holding its version-10 snapshot, tries to save.
    // Without the baseline check it would rewrite the blob from 10 and erase
    // tab A's credential.
    expect(() => assertFreshWriteBaseline(tabBBaseline)).toThrow(VaultWriteConflictError);
  });

  it('refuses every stale write, not just the first', () => {
    announceCommit(50);

    for (const stale of [1, 25, 49]) {
      expect(() => assertFreshWriteBaseline(stale)).toThrow(/vault-write-stale-baseline/);
    }
  });

  it('lets a tab that reloaded continue writing', () => {
    announceCommit(30);

    // The user reloads the tab: it now holds the newer snapshot, so writing is
    // correct again. Refusing forever would be its own denial of service.
    expect(() => assertFreshWriteBaseline(30)).not.toThrow();
    expect(() => assertFreshWriteBaseline(31)).not.toThrow();
  });

  it('reports a distinct, machine-readable code so the UI can explain itself', () => {
    announceCommit(9);

    try {
      assertFreshWriteBaseline(3);
      throw new Error('expected a conflict');
    } catch (err) {
      expect(isVaultWriteConflictError(err)).toBe(true);
      const conflict = err as VaultWriteConflictError;
      expect(conflict.code).toBe(vaultWriteConflictCodes.staleBaseline);
      expect(conflict.baselineVersion).toBe(3);
      expect(conflict.currentVersion).toBe(9);
      // The message carries no user data, only versions.
      expect(conflict.message).toBe('vault-write-stale-baseline:3:9');
    }
  });

  it('exposes the durable version so the UI can prompt for a reload', () => {
    announceCommit(77);

    expect(getDurableVaultVersion()).toBe(77);
  });

  it('treats a missing ledger as no prior state rather than a conflict', () => {
    readVaultIntegrityLedger.mockReturnValue(null);

    expect(() => assertFreshWriteBaseline(1)).not.toThrow();
  });
});
