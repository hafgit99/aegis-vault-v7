/**
 * @file secretKey.ts
 * @description Provides utilities for generating, normalizing, validating, and fingerprinting account secret keys.
 * 
 * DESIGN PARAMETERS:
 * - Entropy Source: 20 cryptographically secure random bytes (160 bits of entropy).
 * - Representation: Base32 encoding (32 characters chosen from A-Z and 2-7).
 * - Formatting: Grouped into 8 blocks of 4 characters separated by hyphens, prefixed with 'A3'.
 *   Format: A3-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 * - Fingerprint: The last 8 characters of the normalized secret key, divided into 2 groups of 4 (XXXX-XXXX).
 *   This is safe to share/view for visual verification of the key without exposing the secret parts.
 * 
 * SECURITY STANDARDS:
 * - 160 bits of entropy provides robust protection against brute-force attacks and matches standard authenticator app strengths.
 */

import { secureRandomBytes } from './random';

const SECRET_KEY_PREFIX = 'A3';

function bytesToBase32(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let output = '';

  bytes.forEach((byte) => {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  });

  if (bits > 0) {
    output += alphabet[(value << (5 - bits)) & 31];
  }

  return output;
}

export function generateAccountSecretKey(): string {
  const raw = bytesToBase32(secureRandomBytes(20)).slice(0, 32);
  const groups = raw.match(/.{1,4}/g) ?? [];
  return [SECRET_KEY_PREFIX, ...groups].join('-');
}

export function normalizeAccountSecretKey(secretKey: string): string {
  return secretKey.trim().toUpperCase().replace(/\s+/g, '').replace(/[^A-Z0-9-]/g, '');
}

export function isAccountSecretKeyFormatValid(secretKey: string): boolean {
  const normalized = normalizeAccountSecretKey(secretKey);
  return new RegExp(`^${SECRET_KEY_PREFIX}(-[A-Z2-7]{4}){8}$`).test(normalized);
}

export function combineMasterPasswordAndSecretKey(password: string, secretKey: string): string {
  return `aegis-vault-v7:${password}\0${normalizeAccountSecretKey(secretKey)}`;
}

export function getSecretKeyFingerprint(secretKey: string): string {
  const normalized = normalizeAccountSecretKey(secretKey).replace(/-/g, '');
  return normalized.slice(-8).match(/.{1,4}/g)?.join('-') ?? 'UNKNOWN';
}
