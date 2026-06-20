/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { digestTotp, normalizeAlgorithm, type TOTPAlgorithm } from './otpCrypto';

interface TOTPOptions {
  algorithm?: TOTPAlgorithm;
  digits?: number;
  periodSeconds?: number;
  timestampMs?: number;
  formatted?: boolean;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decodeBase32Secret(secret: string): Uint8Array {
  const normalized = secret.toUpperCase().replace(/\s+/g, '').replace(/=+$/g, '');
  if (!normalized) return new Uint8Array();

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of normalized) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Invalid Base32 TOTP secret.');
    }

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return new Uint8Array(output);
}

function counterToBytes(counter: number): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);
  return bytes;
}

function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function parseOtpAuthUri(value: string): { secret: string; options: Partial<TOTPOptions> } | null {
  if (!value.toLowerCase().startsWith('otpauth://')) return null;

  const url = new URL(value);
  if (url.protocol !== 'otpauth:' || url.hostname.toLowerCase() !== 'totp') {
    throw new Error('Only otpauth://totp URIs are supported.');
  }

  const secret = url.searchParams.get('secret') || '';
  return {
    secret,
    options: {
      algorithm: normalizeAlgorithm(url.searchParams.get('algorithm') || undefined),
      digits: Number(url.searchParams.get('digits') || undefined) || undefined,
      periodSeconds: Number(url.searchParams.get('period') || undefined) || undefined,
    },
  };
}

/**
 * Generates an RFC 6238 TOTP code using Base32 secrets and HMAC-SHA1/256/512.
 */
export function generateTOTP(secret: string, options: TOTPOptions = {}): string {
  if (!secret) return '000 000';

  try {
    const parsedUri = parseOtpAuthUri(secret);
    const resolvedSecret = parsedUri?.secret ?? secret;
    const resolvedOptions = { ...parsedUri?.options, ...options };
    const {
      algorithm = 'SHA1',
      digits = 6,
      periodSeconds = 30,
      timestampMs = Date.now(),
      formatted = true,
    } = resolvedOptions;
    if (digits < 6 || digits > 8 || periodSeconds <= 0) return '000 000';

    const key = decodeBase32Secret(resolvedSecret);
    if (key.length === 0) return '000 000';

    const counter = Math.floor(Math.floor(timestampMs / 1000) / periodSeconds);
    const digest = digestTotp(key, counterToBytes(counter), algorithm);
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    const modulo = 10 ** digits;
    const code = (binary % modulo).toString().padStart(digits, '0');

    return formatted ? formatCode(code) : code;
  } catch {
    return '000 000';
  }
}

/**
 * Returns the remaining seconds in the current 30-second cycle.
 */
export function getTOTPTimeRemaining(): number {
  const ms = Date.now() % 30000;
  return Math.ceil((30000 - ms) / 1000);
}
