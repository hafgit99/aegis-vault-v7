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

function computeSha256ChecksumByteSync(entropy: Uint8Array): number {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  const w = new Int32Array(64);
  for (let i = 0; i < 8; i++) {
    w[i] = (entropy[i * 4] << 24) | (entropy[i * 4 + 1] << 16) | (entropy[i * 4 + 2] << 8) | entropy[i * 4 + 3];
  }
  w[8] = 0x80000000;
  w[15] = 256; // 32 bytes * 8 bits = 256 bits
  for (let i = 16; i < 64; i++) {
    const s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
    const s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
  }
  let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const temp2 = (S0 + maj) | 0;
    h = g; g = f; f = e; e = (d + temp1) | 0;
    d = c; c = b; b = a; a = (temp1 + temp2) | 0;
  }
  h0 = (h0 + a) | 0;
  return (h0 >>> 24) & 0xff;
}

/**
 * Generates 24 cryptographically random words from the BIP-39 wordlist
 * with full BIP-39 8-bit SHA-256 checksum.
 */
export function generateRecoveryWords(): string[] {
  const rawEntropy = secureRandomBytes(32);
  const csByte = computeSha256ChecksumByteSync(rawEntropy);
  const fullPayload = new Uint8Array(33);
  fullPayload.set(rawEntropy, 0);
  fullPayload[32] = csByte;

  const words: string[] = [];
  let bits = 0;
  let value = 0;

  for (let byteIdx = 0; byteIdx < fullPayload.length && words.length < 24; byteIdx++) {
    value = (value << 8) | fullPayload[byteIdx];
    bits += 8;

    while (bits >= 11 && words.length < 24) {
      const index = (value >>> (bits - 11)) & 0x7FF; // 11-bit mask = 2047
      words.push(BIP39_WORDLIST[index]);
      bits -= 11;
    }
  }

  rawEntropy.fill(0);
  fullPayload.fill(0);
  return words;
}

/**
 * Validates that an array of words forms a valid 24-word BIP-39 phrase with SHA-256 checksum.
 */
export function validateRecoveryWords(words: string[]): boolean {
  if (words.length !== 24) return false;
  const wordMap = new Map<string, number>();
  BIP39_WORDLIST.forEach((w, i) => wordMap.set(w, i));

  const indices: number[] = [];
  for (const w of words) {
    const idx = wordMap.get(w.toLowerCase().trim());
    if (idx === undefined) return false;
    indices.push(idx);
  }

  const bits: number[] = [];
  for (const idx of indices) {
    for (let b = 10; b >= 0; b--) {
      bits.push((idx >>> b) & 1);
    }
  }

  const payload = new Uint8Array(33);
  for (let i = 0; i < 33; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i * 8 + b];
    }
    payload[i] = byteVal;
  }

  const rawEntropy = payload.subarray(0, 32);
  const expectedChecksum = computeSha256ChecksumByteSync(rawEntropy);
  const actualChecksum = payload[32];

  return expectedChecksum === actualChecksum;
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
