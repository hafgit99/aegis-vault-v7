/**
 * @vitest-environment jsdom
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// The real storage module keeps an in-memory cache that outlives a
// `localStorage.clear()`, which would leak state between these cases. A plain
// localStorage-backed stand-in keeps each test's evidence independent.
vi.mock('./indexedDbStorage', () => ({
  getIndexedDbItemSync: (key: string) => localStorage.getItem(key),
  setIndexedDbItemSync: (key: string, value: string) => localStorage.setItem(key, value),
  removeIndexedDbItemSync: (key: string) => localStorage.removeItem(key),
}));

import {
  clearVaultIntegrityLedger,
  lowerVaultSealMark,
  readVaultIntegrityLedger,
  recordVaultSeal,
  VAULT_INTEGRITY_LEDGER_KEY,
} from './vaultIntegrityLedger';

function writeLedgerRaw(value: string) {
  localStorage.setItem(VAULT_INTEGRITY_LEDGER_KEY, value);
}

describe('Y-5: vault integrity ledger', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports no ledger on a fresh install', () => {
    expect(readVaultIntegrityLedger()).toBeNull();
  });

  it('records a seal with the version counter that was signed', () => {
    recordVaultSeal(12);

    expect(readVaultIntegrityLedger()).toMatchObject({
      sealed: true,
      highestVersionCounter: 12,
    });
  });

  it('never lowers the high-water mark on a lower counter', () => {
    recordVaultSeal(40);
    recordVaultSeal(7);

    expect(readVaultIntegrityLedger()?.highestVersionCounter).toBe(40);
  });

  it('treats a corrupt ledger as absent rather than throwing', () => {
    // Refusing to open a vault because an auxiliary record is malformed would
    // be a worse failure than losing the rollback signal.
    writeLedgerRaw('{ not json');
    expect(readVaultIntegrityLedger()).toBeNull();
  });

  it('rejects a ledger written for a different appId', () => {
    writeLedgerRaw(JSON.stringify({
      appId: 'some-other-vault',
      sealed: true,
      highestVersionCounter: 99,
      sealedAt: '',
    }));

    expect(readVaultIntegrityLedger()).toBeNull();
  });

  it('normalises a malformed counter to 0 instead of trusting it', () => {
    writeLedgerRaw(JSON.stringify({
      appId: 'aegis-vault-v7',
      sealed: true,
      highestVersionCounter: 'not a number',
      sealedAt: '',
    }));

    expect(readVaultIntegrityLedger()).toMatchObject({
      sealed: true,
      highestVersionCounter: 0,
    });
  });

  it('clears the ledger for a deliberate wipe', () => {
    recordVaultSeal(30);
    clearVaultIntegrityLedger();

    expect(readVaultIntegrityLedger()).toBeNull();
  });

  it('lowers the mark explicitly for a deliberate restore', () => {
    // Restoring an older snapshot is a legitimate rollback; without this the
    // user could restore once and then never save again.
    recordVaultSeal(88);
    lowerVaultSealMark(5);

    expect(readVaultIntegrityLedger()?.highestVersionCounter).toBe(5);
  });

  it('does not invent a ledger when lowering with none present', () => {
    expect(lowerVaultSealMark(3)).toBeNull();
    expect(readVaultIntegrityLedger()).toBeNull();
  });
});
