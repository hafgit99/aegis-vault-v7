/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { deriveArgon2idKey } from './argon2id';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt, generateSafeIv } from './webcrypto';

export const BACKUP_KDF_PROFILE = {
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
} as const;

export const BACKUP_KDF_LEGACY_HIGH_MEMORY_PROFILE = {
  memoryKiB: 128 * 1024,
  iterations: 4,
  parallelism: 1,
  hashLength: 32,
} as const;

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

  // Validate KDF params to mitigate downgrade KDF attacks (Z-10)
  if (!parsed.kdfParams || typeof parsed.kdfParams !== 'object') {
    throw new SecureBackupError(secureBackupErrorCodes.weakKdfParams);
  }
  const { memoryKiB, iterations } = parsed.kdfParams;
  if (typeof memoryKiB !== 'number' || typeof iterations !== 'number' || memoryKiB < 65536 || iterations < 3) {
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
    if (error instanceof SecureBackupError && error.code === secureBackupErrorCodes.kdfRuntimeFailure) {
      throw error;
    }

    const shouldTryLegacyNativeMismatchFallback = parsed.kdfProfile === 'aegis-backup-cross-platform-v2'
      && parsed.kdfParams?.memoryKiB === BACKUP_KDF_PROFILE.memoryKiB
      && parsed.kdfParams?.iterations === BACKUP_KDF_PROFILE.iterations;

    if (!shouldTryLegacyNativeMismatchFallback) {
      throw error;
    }

    try {
      return await decryptWithParams(BACKUP_KDF_LEGACY_HIGH_MEMORY_PROFILE);
    } catch {
      throw error;
    }
  }
}

