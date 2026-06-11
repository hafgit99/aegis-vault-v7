/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface TOTPOptions {
  digits?: number;
  periodSeconds?: number;
  timestampMs?: number;
  formatted?: boolean;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SHA1_BLOCK_BYTES = 64;

function rotateLeft(value: number, bits: number): number {
  return (value << bits) | (value >>> (32 - bits));
}

function sha1(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const paddedLength = (((message.length + 9 + SHA1_BLOCK_BYTES - 1) / SHA1_BLOCK_BYTES) | 0) * SHA1_BLOCK_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += SHA1_BLOCK_BYTES) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 80; index++) {
      words[index] = rotateLeft(words[index - 3] ^ words[index - 8] ^ words[index - 14] ^ words[index - 16], 1);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index++) {
      let f = 0;
      let k = 0;

      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotateLeft(a, 5) + f + e + k + words[index]) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30) >>> 0;
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new Uint8Array(20);
  const digestView = new DataView(digest.buffer);
  [h0, h1, h2, h3, h4].forEach((value, index) => {
    digestView.setUint32(index * 4, value, false);
  });
  return digest;
}

function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const normalizedKey = key.length > SHA1_BLOCK_BYTES ? sha1(key) : key;
  const keyBlock = new Uint8Array(SHA1_BLOCK_BYTES);
  keyBlock.set(normalizedKey);

  const outerPad = new Uint8Array(SHA1_BLOCK_BYTES);
  const innerPad = new Uint8Array(SHA1_BLOCK_BYTES);
  for (let index = 0; index < SHA1_BLOCK_BYTES; index++) {
    outerPad[index] = keyBlock[index] ^ 0x5c;
    innerPad[index] = keyBlock[index] ^ 0x36;
  }

  const innerMessage = new Uint8Array(innerPad.length + message.length);
  innerMessage.set(innerPad);
  innerMessage.set(message, innerPad.length);
  const innerHash = sha1(innerMessage);

  const outerMessage = new Uint8Array(outerPad.length + innerHash.length);
  outerMessage.set(outerPad);
  outerMessage.set(innerHash, outerPad.length);
  return sha1(outerMessage);
}

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

/**
 * Generates an RFC 6238 TOTP code using Base32 secrets and HMAC-SHA1.
 */
export function generateTOTP(secret: string, options: TOTPOptions = {}): string {
  if (!secret) return '000 000';

  const {
    digits = 6,
    periodSeconds = 30,
    timestampMs = Date.now(),
    formatted = true,
  } = options;

  try {
    const key = decodeBase32Secret(secret);
    if (key.length === 0) return '000 000';

    const counter = Math.floor(Math.floor(timestampMs / 1000) / periodSeconds);
    const digest = hmacSha1(key, counterToBytes(counter));
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
