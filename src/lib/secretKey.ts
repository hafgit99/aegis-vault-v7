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
  return `aegis-vault-v7:${password}\n${normalizeAccountSecretKey(secretKey)}`;
}

export function getSecretKeyFingerprint(secretKey: string): string {
  const normalized = normalizeAccountSecretKey(secretKey).replace(/-/g, '');
  return normalized.slice(-8).match(/.{1,4}/g)?.join('-') ?? 'UNKNOWN';
}
