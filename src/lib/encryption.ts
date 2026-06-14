/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { deriveArgon2idKey } from './argon2id';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt } from './webcrypto';
import { decryptLegacyDataWithPassword } from './legacyCrypto';

export const secureBackupErrorCodes = {
  invalidJson: 'secureBackup.invalidJson',
  missingFields: 'secureBackup.missingFields',
  checksumMismatch: 'secureBackup.checksumMismatch',
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
  const kdfParams = {
    memoryKiB: 128 * 1024,
    iterations: 4,
    parallelism: 1,
    hashLength: 32,
  };

  const aesKey = await deriveArgon2idKey(password, saltHex, kdfParams);
  const bundle = await webCryptoAesGcmEncrypt(rawData, aesKey, secureRandomBytes(12));

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(bundle.ciphertext);
  const manifestChecksumHex = await sha256Hex(cipherBytes);

  return JSON.stringify(
    {
      version: '1.2',
      generator: 'Aegis Secure Core',
      kdf: 'Argon2id',
      kdfImplementation: 'argon2-browser',
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
    return decryptLegacyDataWithPassword(envelopeJsonStr, password);
  }

  if (!parsed.salt || !parsed.iv || !parsed.tag || !parsed.payload || !parsed.checksum) {
    throw new SecureBackupError(secureBackupErrorCodes.missingFields);
  }

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(parsed.payload);
  const calculatedChecksumHex = await sha256Hex(cipherBytes);

  if (calculatedChecksumHex !== parsed.checksum) {
    throw new SecureBackupError(secureBackupErrorCodes.checksumMismatch);
  }

  const aesKey = await deriveArgon2idKey(password, parsed.salt, parsed.kdfParams);

  return webCryptoAesGcmDecrypt(
    {
      iv: parsed.iv,
      tag: parsed.tag,
      ciphertext: parsed.payload,
    },
    aesKey,
  );
}
