/**
 * @file passwordHint.ts
 * @description Manages the master password hint — a locally stored reminder
 * that helps the user recall their master password. The hint is never the
 * password itself; a safety check warns if they are too similar.
 *
 * M1 (SEC-B3 follow-up): the hint is no longer stored as searchable
 * plaintext. It lives inside an AES-256-GCM envelope (v2) wrapped by a fresh
 * CSPRNG 256-bit key:
 *  - Android: the wrapping key is stored in the OS secure storage bridge,
 *    which encrypts it with the hardware-backed AndroidKeyStore key.
 *  - Desktop/browser fallback: the wrapping key is kept in a separate
 *    IndexedDB record. This is defense-in-depth (the hint is no longer a
 *    greppable plaintext string and lives in a different storage record than
 *    its key), not a hardware boundary — documented honestly in the security
 *    report.
 * Legacy v1 plaintext hints found on read are transparently upgraded to v2
 * envelopes and the plaintext record is removed.
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import {
  getIndexedDbItemSync,
  setIndexedDbItemSync,
  removeIndexedDbItemSync,
} from './indexedDbStorage';
import {
  secureStorageKeys,
  getSecureStorageItem,
  setSecureStorageItem,
  removeSecureStorageItem,
} from './secureStorage';
import { secureRandomBytes } from './random';
import {
  webCryptoAesGcmEncrypt,
  webCryptoAesGcmDecrypt,
  generateSafeIv,
  type WebCryptoAesGcmPayload,
} from './webcrypto';

const HINT_STORAGE_KEY = 'aegis_password_hint';
const HINT_KEY_INDEXED_DB_STORAGE_KEY = 'aegis_password_hint_key';

interface PasswordHintEnvelope {
  version: 2;
  cipher: 'AES-256-GCM';
  payload: WebCryptoAesGcmPayload;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(atob(value).split('').map((char) => char.charCodeAt(0)));
}

function getOrCreateWrappingKey(): Uint8Array {
  // Preferred: OS secure storage (Android → hardware-backed AndroidKeyStore).
  const storedKey = getSecureStorageItem(secureStorageKeys.passwordHintWrappingKey);
  if (storedKey) {
    return base64ToBytes(storedKey);
  }

  const generatedKey = secureRandomBytes(32);
  if (setSecureStorageItem(secureStorageKeys.passwordHintWrappingKey, bytesToBase64(generatedKey))) {
    return generatedKey;
  }

  // Fallback (desktop/browser): separate IndexedDB record. Defense-in-depth
  // only — see module docstring.
  const fallbackKey = getIndexedDbItemSync(HINT_KEY_INDEXED_DB_STORAGE_KEY);
  if (fallbackKey) {
    return base64ToBytes(fallbackKey);
  }
  setIndexedDbItemSync(HINT_KEY_INDEXED_DB_STORAGE_KEY, bytesToBase64(generatedKey));
  return generatedKey;
}

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
 * Stores the password hint inside an encrypted envelope. Returns a warning
 * flag if the hint looks too similar to the password (callers should display
 * a UI warning in that case).
 */
export async function setPasswordHint(hint: string, masterPassword?: string): Promise<{ saved: boolean; warning: boolean }> {
  const trimmed = hint.trim();
  if (!trimmed) {
    clearPasswordHint();
    return { saved: true, warning: false };
  }

  const warning = masterPassword ? isHintDangerouslySimilar(trimmed, masterPassword) : false;
  const wrappingKey = getOrCreateWrappingKey();
  try {
    const payload = await webCryptoAesGcmEncrypt(trimmed, wrappingKey, generateSafeIv());
    const envelope: PasswordHintEnvelope = {
      version: 2,
      cipher: 'AES-256-GCM',
      payload,
    };
    setIndexedDbItemSync(HINT_STORAGE_KEY, JSON.stringify(envelope));
    return { saved: true, warning };
  } finally {
    wrappingKey.fill(0);
  }
}

/** Returns the decrypted stored hint, or `null` if none exists. */
export async function getPasswordHint(): Promise<string | null> {
  const raw = getIndexedDbItemSync(HINT_STORAGE_KEY);
  if (!raw) return null;

  // Legacy v1 migration: transparently upgrade a plaintext hint to the v2
  // envelope and remove the plaintext record.
  if (!raw.trimStart().startsWith('{')) {
    const migrated = await setPasswordHint(raw);
    return migrated.saved ? raw : null;
  }

  try {
    const envelope = JSON.parse(raw) as PasswordHintEnvelope;
    if (envelope.version !== 2 || envelope.cipher !== 'AES-256-GCM') return null;
    const wrappingKey = getOrCreateWrappingKey();
    try {
      return await webCryptoAesGcmDecrypt(envelope.payload, wrappingKey);
    } finally {
      wrappingKey.fill(0);
    }
  } catch {
    // Corrupt envelope or missing key — fail closed, clear the stale record.
    clearPasswordHint();
    return null;
  }
}

/** Deletes the stored hint (envelope and, where present, the wrapping key). */
export function clearPasswordHint(): void {
  removeIndexedDbItemSync(HINT_STORAGE_KEY);
  removeSecureStorageItem(secureStorageKeys.passwordHintWrappingKey);
  removeIndexedDbItemSync(HINT_KEY_INDEXED_DB_STORAGE_KEY);
}
