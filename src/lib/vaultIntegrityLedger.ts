/**
 * @file vaultIntegrityLedger.ts
 * @description Y-5 — the "high-water mark" that lives OUTSIDE the vault file.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { getIndexedDbItemSync, setIndexedDbItemSync, removeIndexedDbItemSync } from './indexedDbStorage';
import { VAULT_DB_APP_ID } from './vaultDatabaseFormat';

export const VAULT_INTEGRITY_LEDGER_KEY = 'KalderaShield_vault_integrity_ledger';

export interface VaultIntegrityLedger {
  appId: string;
  /**
   * True once this vault has been sealed at least once.
   *
   * This is what makes a missing `integrityHmac` detectable. Before it
   * existed, "no tag" and "tag deliberately blanked" were the same state, and
   * because the re-seal rule keys off the integrity verdict, blanking the field
   * was enough to have the next write seal whatever the attacker had put in the
   * file.
   */
  sealed: boolean;
  /**
   * The highest `versionCounter` this installation has ever sealed.
   *
   * The in-memory high-water mark was module state, so it reset on every app
   * restart — which made rollback detection trivially bypassable: replay an old
   * database file, restart, and the rollback looked like a first run. Keeping
   * it outside the vault file means the file alone is no longer sufficient to
   * roll the vault back.
   */
  highestVersionCounter: number;
  sealedAt: string;
}

/**
 * Threat model, stated plainly.
 *
 * The ledger lives in IndexedDB + localStorage, not in the vault file. That is
 * a *location* separation, not cryptographic one: an attacker who can write to
 * both locations has already defeated the client-side model entirely, and no
 * amount of keying the ledger changes that.
 *
 * What the separation does buy is the property the finding needed: **editing the
 * vault database file is no longer sufficient.** A stale, corrupted, rolled-back
 * or tampered file is now rejected on its own, without the attacker also having
 * to reach a second storage location. That covers the realistic cases — a
 * restored backup, a sync peer replaying old data, a partial write, a file
 * edited by another tool, a compromised extension — none of which can touch
 * IndexedDB.
 */
export function readVaultIntegrityLedger(): VaultIntegrityLedger | null {
  const raw = getIndexedDbItemSync(VAULT_INTEGRITY_LEDGER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VaultIntegrityLedger>;
    if (parsed.appId !== VAULT_DB_APP_ID) return null;
    return {
      appId: parsed.appId,
      sealed: parsed.sealed === true,
      highestVersionCounter: typeof parsed.highestVersionCounter === 'number'
        && Number.isFinite(parsed.highestVersionCounter)
        ? parsed.highestVersionCounter
        : 0,
      sealedAt: typeof parsed.sealedAt === 'string' ? parsed.sealedAt : '',
    };
  } catch {
    // A corrupt ledger is treated as absent rather than fatal: refusing to open
    // a vault because an auxiliary record is malformed would be a worse
    // failure than losing the rollback signal.
    return null;
  }
}

/**
 * Records that the vault has been sealed at `versionCounter`.
 *
 * Monotonic: the mark never moves backwards, so a lower value (a restored
 * older file that happens to verify) cannot lower the bar.
 */
export function recordVaultSeal(versionCounter: number): VaultIntegrityLedger {
  const current = readVaultIntegrityLedger();
  const next: VaultIntegrityLedger = {
    appId: VAULT_DB_APP_ID,
    sealed: true,
    highestVersionCounter: Math.max(current?.highestVersionCounter ?? 0, versionCounter),
    sealedAt: new Date().toISOString(),
  };
  setIndexedDbItemSync(VAULT_INTEGRITY_LEDGER_KEY, JSON.stringify(next));
  return next;
}

/**
 * Clears the ledger. Reserved for a deliberate user-initiated wipe
 * (`resetAll`) — a path where the vault is intentionally going backwards, so
 * keeping the old high-water mark would permanently block every future write.
 */
export function clearVaultIntegrityLedger(): void {
  removeIndexedDbItemSync(VAULT_INTEGRITY_LEDGER_KEY);
}

/**
 * Lowers the high-water mark to `versionCounter` after a deliberate restore.
 *
 * Restoring an older snapshot is a legitimate rollback, so the mark has to
 * follow it down — otherwise the user could restore once and then be unable to
 * save anything again. This is deliberately a separate, explicitly named
 * function so that lowering the bar is always a conscious act at a known call
 * site, never a side effect of an ordinary write.
 */
export function lowerVaultSealMark(versionCounter: number): VaultIntegrityLedger | null {
  const current = readVaultIntegrityLedger();
  if (!current) return null;
  const next: VaultIntegrityLedger = {
    ...current,
    highestVersionCounter: Math.max(0, versionCounter),
    sealedAt: new Date().toISOString(),
  };
  setIndexedDbItemSync(VAULT_INTEGRITY_LEDGER_KEY, JSON.stringify(next));
  return next;
}
