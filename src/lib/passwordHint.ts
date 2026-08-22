/**
 * @file passwordHint.ts
 * @description Manages the master password hint — a plaintext reminder stored
 * locally that helps the user recall their master password. The hint is never
 * the password itself; a safety check warns if they are too similar.
 *
 * Storage: IndexedDB via the shared indexedDbStorage helpers so the hint
 * survives browser-level localStorage clears while remaining local-only.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import {
  getIndexedDbItemSync,
  setIndexedDbItemSync,
  removeIndexedDbItemSync,
} from './indexedDbStorage';

const HINT_STORAGE_KEY = 'aegis_password_hint';

/**
 * Returns `true` when the hint is dangerously close to the actual password
 * and should trigger a UI warning to the user.
 *
 * Checks:
 *  - Exact match (case-insensitive)
 *  - Hint is a substring of the password (or vice-versa)
 *  - Normalised Levenshtein distance < 30 %
 */
export function isHintDangerouslySimilar(hint: string, password: string): boolean {
  if (!hint || !password) return false;

  const h = hint.toLowerCase().trim();
  const p = password.toLowerCase().trim();

  // Exact match
  if (h === p) return true;

  // Substring containment
  if (p.includes(h) || h.includes(p)) return true;

  // Token/word containment for tokens >= 3 characters
  const hintTokens = h.split(/[^a-z0-9]+/i).filter((tok) => tok.length >= 3);
  for (const token of hintTokens) {
    if (p.includes(token)) return true;
  }

  const passTokens = p.split(/[^a-z0-9]+/i).filter((tok) => tok.length >= 3);
  for (const token of passTokens) {
    if (h.includes(token)) return true;
  }

  // Reverse string match
  const reversedH = h.split('').reverse().join('');
  if (p.includes(reversedH) || reversedH.includes(p)) return true;

  // Levenshtein distance (bounded by shorter string length)
  const distance = levenshtein(h, p);
  const maxLen = Math.max(h.length, p.length);
  if (maxLen === 0) return false;
  const similarity = 1 - distance / maxLen;

  return similarity >= 0.7;
}

/**
 * Classic Levenshtein via two-row Wagner–Fischer.
 */
function levenshtein(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const prevJ = prev[j] ?? 0;
      const currJMinus1 = curr[j - 1] ?? 0;
      const prevJMinus1 = prev[j - 1] ?? 0;
      curr[j] = Math.min(
        prevJ + 1,
        currJMinus1 + 1,
        prevJMinus1 + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length] ?? 0;
}

// ── CRUD ────────────────────────────────────────────────────────────────

/**
 * Stores the password hint. Returns a warning flag if the hint looks too
 * similar to the password (callers should display a UI warning in that case).
 */
export function setPasswordHint(hint: string, masterPassword?: string): { saved: boolean; warning: boolean } {
  const trimmed = hint.trim();
  if (!trimmed) {
    clearPasswordHint();
    return { saved: true, warning: false };
  }

  const warning = masterPassword ? isHintDangerouslySimilar(trimmed, masterPassword) : false;
  setIndexedDbItemSync(HINT_STORAGE_KEY, trimmed);
  return { saved: true, warning };
}

/** Returns the stored hint, or `null` if none exists. */
export function getPasswordHint(): string | null {
  return getIndexedDbItemSync(HINT_STORAGE_KEY) || null;
}

/** Deletes the stored hint. */
export function clearPasswordHint(): void {
  removeIndexedDbItemSync(HINT_STORAGE_KEY);
}
