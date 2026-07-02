/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Legacy custom cryptography has been removed from production code.
 *
 * Older Aegis builds used pure-JS compatibility primitives for backup and
 * database migration. Those primitives are intentionally no longer shipped: no
 * SHA/HMAC/HKDF/simulated-Argon2id/AES fallback remains in this module. Users
 * with pre-hardening exports must re-export from an earlier migration build
 * before importing into this release line.
 */
export const legacyCryptoErrorCodes = {
  invalidJson: 'legacyCrypto.invalidJson',
  missingFields: 'legacyCrypto.missingFields',
  checksumMismatch: 'legacyCrypto.checksumMismatch',
  integrityMismatch: 'legacyCrypto.integrityMismatch',
  unsupportedEnvelope: 'legacyCrypto.unsupportedEnvelope',
  streamCipherRemoved: 'legacyCrypto.streamCipherRemoved',
  removed: 'legacyCrypto.removed',
} as const;

export type LegacyCryptoErrorCode = (typeof legacyCryptoErrorCodes)[keyof typeof legacyCryptoErrorCodes];

export class LegacyCryptoError extends Error {
  constructor(public readonly code: LegacyCryptoErrorCode = legacyCryptoErrorCodes.removed) {
    super(code);
    this.name = 'LegacyCryptoError';
  }
}

export function rejectRemovedLegacyCrypto(): never {
  throw new LegacyCryptoError(legacyCryptoErrorCodes.removed);
}
