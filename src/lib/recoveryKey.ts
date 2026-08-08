/**
 * @file recoveryKey.ts
 * @description Recovery Key module for AegisVault v7.
 *
 * Generates a 24-word BIP-39 mnemonic (256-bit entropy) that encrypts the
 * master password with AES-256-GCM + Argon2id KDF. When the user forgets
 * their master password, they can enter their recovery words to decrypt
 * the stored master password and set a new one — without losing vault data.
 *
 * Storage: IndexedDB/SecureStorage (local-only, zero-knowledge).
 *
 * @license SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { deriveArgon2idKey } from './argon2id';
import { webCryptoAesGcmEncrypt, webCryptoAesGcmDecrypt, generateSafeIv, type WebCryptoAesGcmPayload } from './webcrypto';
import { BIP39_WORDLIST } from './recoveryWords';
import {
  getSecureStorageItem,
  removeSecureStorageItem,
  secureStorageKeys,
  setSecureStorageItem,
} from './secureStorage';
import {
  getIndexedDbItemSync,
  setIndexedDbItemSync,
  removeIndexedDbItemSync,
} from './indexedDbStorage';

const RECOVERY_STORAGE_KEY = 'aegis_recovery_key_bundle';

/** KDF profile for recovery key derivation — matches backup profile. */
const RECOVERY_KDF_PROFILE = {
  memoryKiB: 32 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

// ── Recovery Bundle Schema ──────────────────────────────────────────────

interface RecoveryKeyBundle {
  version: 1;
  kdf: 'Argon2id';
  cipher: 'AES-256-GCM';
  salt: string;
  bundle: WebCryptoAesGcmPayload;
  kdfParams: typeof RECOVERY_KDF_PROFILE;
  createdAt: string;
}

// ── Word Generation ─────────────────────────────────────────────────────

/**
 * Generates 24 cryptographically random words from the BIP-39 wordlist.
 * Each word is selected by drawing 11 bits of entropy from CSPRNG output.
 * 24 words × 11 bits = 264 bits consumed, yielding 256 bits of effective
 * entropy (the remaining 8 bits form a checksum byte that we discard since
 * we don't need BIP-39 checksum compatibility for vault recovery).
 */
export function generateRecoveryWords(): string[] {
  const entropy = secureRandomBytes(33); // 264 bits → 24 × 11-bit indices
  const words: string[] = [];
  let bits = 0;
  let value = 0;

  for (let byteIdx = 0; byteIdx < entropy.length && words.length < 24; byteIdx++) {
    value = (value << 8) | entropy[byteIdx];
    bits += 8;

    while (bits >= 11 && words.length < 24) {
      const index = (value >>> (bits - 11)) & 0x7FF; // 11-bit mask = 2047
      words.push(BIP39_WORDLIST[index]);
      bits -= 11;
    }
  }

  entropy.fill(0);
  return words;
}

/**
 * Validates that an array of words forms a valid 24-word recovery phrase.
 * Every word must exist in the BIP-39 wordlist.
 */
export function validateRecoveryWords(words: string[]): boolean {
  if (words.length !== 24) return false;
  const wordSet = new Set(BIP39_WORDLIST);
  return words.every(w => wordSet.has(w.toLowerCase().trim()));
}

/**
 * Formats recovery words into 6 groups of 4 for display.
 */
export function formatRecoveryWords(words: string[]): string {
  const groups: string[] = [];
  for (let i = 0; i < words.length; i += 4) {
    const group = words.slice(i, i + 4).map((w, j) => `${i + j + 1}. ${w}`).join('  ');
    groups.push(group);
  }
  return groups.join('\n');
}

// ── Encryption / Decryption ─────────────────────────────────────────────

/**
 * Derives an AES-256 key from the recovery words using Argon2id.
 */
async function deriveKeyFromRecoveryWords(words: string[], salt: string): Promise<Uint8Array> {
  const passphrase = words.join(' ').toLowerCase();
  return deriveArgon2idKey(passphrase, salt, RECOVERY_KDF_PROFILE);
}

/**
 * Sets up a recovery key by encrypting the master password with the
 * recovery words. The encrypted bundle is stored locally.
 *
 * @param masterPassword - The current master password to protect
 * @param recoveryWords  - 24 BIP-39 words (output of generateRecoveryWords)
 */
export async function setupRecoveryKey(masterPassword: string, recoveryWords: string[]): Promise<void> {
  if (!validateRecoveryWords(recoveryWords)) {
    throw new Error('Invalid recovery words: must be 24 valid BIP-39 words.');
  }

  const saltBytes = secureRandomBytes(16);
  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const derivedKey = await deriveKeyFromRecoveryWords(recoveryWords, saltHex);
  const bundle = await webCryptoAesGcmEncrypt(masterPassword, derivedKey, generateSafeIv());

  const recoveryBundle: RecoveryKeyBundle = {
    version: 1,
    kdf: 'Argon2id',
    cipher: 'AES-256-GCM',
    salt: saltHex,
    bundle,
    kdfParams: { ...RECOVERY_KDF_PROFILE },
    createdAt: new Date().toISOString(),
  };

  const serialised = JSON.stringify(recoveryBundle);

  // Prefer secure storage (Tauri keychain), fall back to IndexedDB
  if (!setSecureStorageItem(secureStorageKeys.recoveryKeyBundle ?? RECOVERY_STORAGE_KEY, serialised)) {
    setIndexedDbItemSync(RECOVERY_STORAGE_KEY, serialised);
  }
}

/**
 * Recovers the master password by decrypting the stored bundle with the
 * provided recovery words.
 *
 * @returns The decrypted master password, or throws on failure.
 */
export async function recoverWithRecoveryKey(recoveryWords: string[]): Promise<string> {
  if (!validateRecoveryWords(recoveryWords)) {
    throw new Error('Invalid recovery words: must be 24 valid BIP-39 words.');
  }

  const bundle = loadRecoveryBundle();
  if (!bundle) {
    throw new Error('No recovery key has been set up.');
  }

  const derivedKey = await deriveKeyFromRecoveryWords(recoveryWords, bundle.salt);

  try {
    return await webCryptoAesGcmDecrypt(bundle.bundle, derivedKey);
  } catch {
    throw new Error('Recovery failed: words do not match. Check your recovery phrase.');
  }
}

// ── Storage Helpers ─────────────────────────────────────────────────────

function loadRecoveryBundle(): RecoveryKeyBundle | null {
  const raw =
    getSecureStorageItem(secureStorageKeys.recoveryKeyBundle ?? RECOVERY_STORAGE_KEY) ??
    getIndexedDbItemSync(RECOVERY_STORAGE_KEY);

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as RecoveryKeyBundle;
    if (parsed.version === 1 && parsed.bundle) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Returns `true` when a recovery key bundle exists in local storage. */
export function isRecoveryKeySetup(): boolean {
  return loadRecoveryBundle() !== null;
}

/** Returns the creation date of the recovery key, or `null`. */
export function getRecoveryKeyCreatedAt(): string | null {
  return loadRecoveryBundle()?.createdAt ?? null;
}

/** Removes the recovery key bundle from all storage layers. */
export function disableRecoveryKey(): void {
  removeSecureStorageItem(secureStorageKeys.recoveryKeyBundle ?? RECOVERY_STORAGE_KEY);
  removeIndexedDbItemSync(RECOVERY_STORAGE_KEY);
}
