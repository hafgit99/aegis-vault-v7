/**
 * @vitest-environment jsdom
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearVaultIntegrityLedger, recordVaultSeal } from './vaultIntegrityLedger';
import { detectLostIntegrityLedger } from './sqlite_opfs';

const LEDGER_KEY = 'aegis_vault_integrity_ledger';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('O-8 lost integrity ledger detection', () => {
  it('does not flag a vault that was never sealed', () => {
    // Fresh setup: no seal and no ledger is the normal state, not a signal.
    const report = detectLostIntegrityLedger({ integrityHmac: '', sealedAtVersionCounter: 1 });

    expect(report.detected).toBe(false);
  });

  it('does not flag a missing state', () => {
    expect(detectLostIntegrityLedger(null).detected).toBe(false);
  });

  it('does not flag a sealed vault whose ledger is intact', () => {
    recordVaultSeal(42);

    const report = detectLostIntegrityLedger({
      integrityHmac: 'deadbeef',
      sealedAtVersionCounter: 42,
    });

    expect(report.detected).toBe(false);
    expect(report.vaultSealedAtVersion).toBe(42);
  });

  it('flags a sealed vault whose ledger was lost', () => {
    // The O-8 condition: the user cleared site data (or storage was restored),
    // so the durable high-water mark is gone while the vault still carries a
    // seal. A replayed older file can no longer be detected.
    clearVaultIntegrityLedger();

    const report = detectLostIntegrityLedger({
      integrityHmac: 'deadbeef',
      sealedAtVersionCounter: 400,
    });

    expect(report.detected).toBe(true);
    expect(report.vaultSealedAtVersion).toBe(400);
  });

  it('flags a sealed vault whose ledger is corrupt rather than absent', () => {
    // A corrupt ledger reads as absent, which is the same risk: no usable mark.
    localStorage.setItem(LEDGER_KEY, '{not valid json');

    const report = detectLostIntegrityLedger({
      integrityHmac: 'deadbeef',
      sealedAtVersionCounter: 12,
    });

    expect(report.detected).toBe(true);
  });

  it('reports a null version when the vault does not record one', () => {
    clearVaultIntegrityLedger();

    const report = detectLostIntegrityLedger({ integrityHmac: 'deadbeef' });

    expect(report.detected).toBe(true);
    expect(report.vaultSealedAtVersion).toBeNull();
  });

  it('deliberately does not block: the vault must stay usable', () => {
    // The important assertion, stated as a test.
    //
    // Failing closed here was considered and rejected. A user who deliberately
    // clears site data and restores their own encrypted backup would be locked
    // out of their password manager. Bricking a working vault to defend against a
    // case they may well have caused themselves is a worse harm than the lost
    // detection signal, so detection reports and the vault continues to open.
    clearVaultIntegrityLedger();

    const report = detectLostIntegrityLedger({
      integrityHmac: 'deadbeef',
      sealedAtVersionCounter: 400,
    });

    expect(report.detected).toBe(true);
    // Detection is informational: it reports, it does not throw or withhold.
    expect(() => detectLostIntegrityLedger({ integrityHmac: 'x', sealedAtVersionCounter: 1 }))
      .not.toThrow();
  });
});
