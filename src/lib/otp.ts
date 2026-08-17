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

export class TOTPValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TOTPValidationError';
  }
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SUPPORTED_TOTP_DIGITS = new Set([6, 7, 8]);
const MIN_TOTP_PERIOD_SECONDS = 15;
const MAX_TOTP_PERIOD_SECONDS = 300;

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

function parseOptionalInteger(value: string | null, label: string): number | undefined {
  if (value === null || value === '') return undefined;
  if (!/^\d+$/.test(value)) {
    throw new TOTPValidationError(`Invalid TOTP ${label}: expected an integer.`);
  }
  return Number(value);
}

function validateTotpOptions(digits: number, periodSeconds: number): void {
  if (!Number.isInteger(digits) || !SUPPORTED_TOTP_DIGITS.has(digits)) {
    throw new TOTPValidationError('Unsupported TOTP digit count. Supported values are 6, 7, and 8.');
  }

  if (
    !Number.isInteger(periodSeconds) ||
    periodSeconds < MIN_TOTP_PERIOD_SECONDS ||
    periodSeconds > MAX_TOTP_PERIOD_SECONDS
  ) {
    throw new TOTPValidationError('Unsupported TOTP period. Supported values are 15 to 300 seconds.');
  }
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
      digits: parseOptionalInteger(url.searchParams.get('digits'), 'digits'),
      periodSeconds: parseOptionalInteger(url.searchParams.get('period'), 'period'),
    },
  };
}

/**
 * Generates an RFC 6238 TOTP code using Base32 secrets and HMAC-SHA1/256/512.
 */
export async function generateTOTP(secret: string, options: TOTPOptions = {}): Promise<string> {
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
    validateTotpOptions(digits, periodSeconds);

    const key = decodeBase32Secret(resolvedSecret);
    if (key.length === 0) return '000 000';

    const counter = Math.floor(Math.floor(timestampMs / 1000) / periodSeconds);
    const digest = await digestTotp(key, counterToBytes(counter), algorithm);
    const offset = digest[digest.length - 1] & 0x0f;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);
    const modulo = 10 ** digits;
    const code = (binary % modulo).toString().padStart(digits, '0');

    return formatted ? formatCode(code) : code;
  } catch (error) {
    if (error instanceof TOTPValidationError) throw error;
    return '000 000';
  }
}

/**
 * Returns the remaining seconds in the current cycle for a given period (default: 30s).
 */
export function getTOTPTimeRemaining(period = 30): number {
  const safePeriod = Math.max(1, period);
  const cycleMs = safePeriod * 1000;
  const ms = Date.now() % cycleMs;
  return Math.ceil((cycleMs - ms) / 1000);
}
