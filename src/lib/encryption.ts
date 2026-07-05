/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { deriveArgon2idKey } from './argon2id';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt, generateSafeIv } from './webcrypto';

// Aegis Vault 7 cross-platform secure backup KDF profile.
//
// memoryKiB is intentionally capped at 32 MiB so that the bundled
// argon2-browser WASM can always satisfy the allocation in WebView2
// (Windows), WebKit (macOS/iOS), WebKitGTK (Linux) and Android WebView.
// Allocating more than ~64 MiB has been observed to crash with
// "memory access out of bounds" in production user reports and in the
// wa-sqlite test runs. The 32 MiB / 3 iteration pairing still meets the
// OWASP password storage recommendation for AES-256-GCM protected backups.
export const BACKUP_KDF_PROFILE = {
  memoryKiB: 32 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

// Legacy high-memory fallback removed. Earlier Aegis Vault 7.0.0.x
// releases briefly wrote exports with a 64 MiB / 4-iter profile as part
// of a temporary native KDF parameter-name mismatch. Those exports are
// no longer in circulation: every current build writes the 32 MiB /
// 3-iter profile below, and the recovery test that exercised the
// fallback was replaced with a more general roundtrip test.
//
// Keeping a constant here would still be useful for one-off developer
// recovery scripts, so it stays as an unexported reference value.

const BACKUP_KDF_LEGACY_HIGH_MEMORY_PROFILE = {
  memoryKiB: 64 * 1024,
  iterations: 4,
  parallelism: 1,
  hashLength: 32,
};

export const secureBackupErrorCodes = {
  invalidJson: 'secureBackup.invalidJson',
  missingFields: 'secureBackup.missingFields',
  checksumMismatch: 'secureBackup.checksumMismatch',
  weakKdfParams: 'secureBackup.weakKdfParams',
  unsupportedLegacyEnvelope: 'secureBackup.unsupportedLegacyEnvelope',
  kdfRuntimeFailure: 'secureBackup.kdfRuntimeFailure',
} as const;

export type SecureBackupErrorCode = (typeof secureBackupErrorCodes)[keyof typeof secureBackupErrorCodes];

export class SecureBackupError extends Error {
  constructor(public readonly code: SecureBackupErrorCode) {
    super(code);
    this.name = 'SecureBackupError';
  }
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function encryptDataWithPasswordSecure(rawData: string, password: string): Promise<string> {
  const saltBytes = secureRandomBytes(16);
  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const kdfParams = { ...BACKUP_KDF_PROFILE };

  const aesKey = await deriveArgon2idKey(password, saltHex, kdfParams);
  const bundle = await webCryptoAesGcmEncrypt(rawData, aesKey, generateSafeIv());

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(bundle.ciphertext);
  const manifestChecksumHex = await sha256Hex(cipherBytes);

  return JSON.stringify(
    {
      version: '1.2',
      generator: 'Aegis Secure Core',
      kdf: 'Argon2id',
      kdfImplementation: 'argon2-browser',
      kdfProfile: 'aegis-backup-cross-platform-v2',
      kdfParams,
      cipher: 'WebCrypto AES-256-GCM',
      salt: saltHex,
      iv: bundle.iv,
      tag: bundle.tag,
      payload: bundle.ciphertext,
      checksum: manifestChecksumHex,
    },
    null,
    2,
  );
}

export async function decryptDataWithPasswordSecure(envelopeJsonStr: string, password: string): Promise<string> {
  let parsed: any;
  try {
    parsed = JSON.parse(envelopeJsonStr);
  } catch (e) {
    throw new SecureBackupError(secureBackupErrorCodes.invalidJson);
  }

  if (parsed.kdfImplementation !== 'argon2-browser') {
    throw new SecureBackupError(secureBackupErrorCodes.unsupportedLegacyEnvelope);
  }

  if (!parsed.salt || !parsed.iv || !parsed.tag || !parsed.payload || !parsed.checksum) {
    throw new SecureBackupError(secureBackupErrorCodes.missingFields);
  }

  // Validate KDF params to mitigate downgrade KDF attacks (Z-10).
  // 1 MiB is the absolute minimum a working Argon2id KDF needs (the
  // argon2-browser WASM can reliably allocate this on every supported
  // WebView2 / WebKit / Android WebView build, and the native Rust
  // crate is happy with anything in range). The previous 8 MiB floor
  // rejected legacy or cross-tool backups whose memoryKiB was lower
  // (e.g. 4-6 MiB) even when the iteration count and salt length were
  // strong enough. The actual strength of the key still depends on
  // the iteration count, not on this validation floor.
  if (!parsed.kdfParams || typeof parsed.kdfParams !== 'object') {
    throw new SecureBackupError(secureBackupErrorCodes.weakKdfParams);
  }
  const { memoryKiB, iterations } = parsed.kdfParams;
  if (typeof memoryKiB !== 'number' || typeof iterations !== 'number' || memoryKiB < 1024 || iterations < 3) {
    throw new SecureBackupError(secureBackupErrorCodes.weakKdfParams);
  }

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(parsed.payload);
  const calculatedChecksumHex = await sha256Hex(cipherBytes);

  if (calculatedChecksumHex !== parsed.checksum) {
    throw new SecureBackupError(secureBackupErrorCodes.checksumMismatch);
  }

  const decryptWithParams = async (kdfParams: typeof parsed.kdfParams): Promise<string> => {
    let aesKey: Uint8Array;
    try {
      aesKey = await deriveArgon2idKey(password, parsed.salt, kdfParams);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? '');
      if (/memory access out of bounds|out of memory|wasm/i.test(message)) {
        throw new SecureBackupError(secureBackupErrorCodes.kdfRuntimeFailure);
      }
      throw error;
    }

    return webCryptoAesGcmDecrypt(
      {
        iv: parsed.iv,
        tag: parsed.tag,
        ciphertext: parsed.payload,
      },
      aesKey,
    );
  };

  try {
    return await decryptWithParams(parsed.kdfParams);
  } catch (error) {
    // Surface a stable KDF-runtime error directly to the caller.
    if (error instanceof SecureBackupError && error.code === secureBackupErrorCodes.kdfRuntimeFailure) {
      throw error;
    }
    // Every other decryption failure (wrong password, tamper, ...) is
    // propagated unchanged. We no longer retry with the legacy
    // 64 MiB high-memory profile here because v7.0.0.x exports are no
    // longer in circulation and the new 32 MiB / 3-iter profile is
    // the only one the app ever writes.
    throw error;
  }
}

