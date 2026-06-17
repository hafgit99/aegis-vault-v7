/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

interface TOTPOptions {
  algorithm?: TOTPAlgorithm;
  digits?: number;
  periodSeconds?: number;
  timestampMs?: number;
  formatted?: boolean;
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SHA1_BLOCK_BYTES = 64;
const SHA256_BLOCK_BYTES = 64;
const SHA512_BLOCK_BYTES = 128;
const UINT64_MASK = (1n << 64n) - 1n;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA512_INITIAL_HASH = [
  0x6a09e667f3bcc908n,
  0xbb67ae8584caa73bn,
  0x3c6ef372fe94f82bn,
  0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n,
  0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn,
  0x5be0cd19137e2179n,
];

const SHA512_ROUND_CONSTANTS = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];

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

function rotateRight32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256(message: Uint8Array): Uint8Array {
  const bitLength = message.length * 8;
  const paddedLength = (((message.length + 9 + SHA256_BLOCK_BYTES - 1) / SHA256_BLOCK_BYTES) | 0) * SHA256_BLOCK_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += SHA256_BLOCK_BYTES) {
    for (let index = 0; index < 16; index++) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index++) {
      const s0 = rotateRight32(words[index - 15], 7) ^ rotateRight32(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight32(words[index - 2], 17) ^ rotateRight32(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index++) {
      const s1 = rotateRight32(e, 6) ^ rotateRight32(e, 11) ^ rotateRight32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const s0 = rotateRight32(a, 2) ^ rotateRight32(a, 13) ^ rotateRight32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  hash.forEach((value, index) => digestView.setUint32(index * 4, value, false));
  return digest;
}

function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const normalizedKey = key.length > SHA256_BLOCK_BYTES ? sha256(key) : key;
  const keyBlock = new Uint8Array(SHA256_BLOCK_BYTES);
  keyBlock.set(normalizedKey);

  const outerPad = new Uint8Array(SHA256_BLOCK_BYTES);
  const innerPad = new Uint8Array(SHA256_BLOCK_BYTES);
  for (let index = 0; index < SHA256_BLOCK_BYTES; index++) {
    outerPad[index] = keyBlock[index] ^ 0x5c;
    innerPad[index] = keyBlock[index] ^ 0x36;
  }

  const innerMessage = new Uint8Array(innerPad.length + message.length);
  innerMessage.set(innerPad);
  innerMessage.set(message, innerPad.length);
  const innerHash = sha256(innerMessage);

  const outerMessage = new Uint8Array(outerPad.length + innerHash.length);
  outerMessage.set(outerPad);
  outerMessage.set(innerHash, outerPad.length);
  return sha256(outerMessage);
}

function rotateRight64(value: bigint, bits: bigint): bigint {
  return ((value >> bits) | (value << (64n - bits))) & UINT64_MASK;
}

function shiftRight64(value: bigint, bits: bigint): bigint {
  return value >> bits;
}

function readUint64(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index++) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  return value;
}

function writeUint64(bytes: Uint8Array, offset: number, value: bigint): void {
  for (let index = 7; index >= 0; index--) {
    bytes[offset + index] = Number(value & 0xffn);
    value >>= 8n;
  }
}

function sha512(message: Uint8Array): Uint8Array {
  const bitLength = BigInt(message.length) * 8n;
  const paddedLength = Math.ceil((message.length + 17) / SHA512_BLOCK_BYTES) * SHA512_BLOCK_BYTES;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  writeUint64(padded, paddedLength - 8, bitLength);

  const hash = [...SHA512_INITIAL_HASH];
  const words = new Array<bigint>(80).fill(0n);

  for (let offset = 0; offset < paddedLength; offset += SHA512_BLOCK_BYTES) {
    for (let index = 0; index < 16; index++) {
      words[index] = readUint64(padded, offset + index * 8);
    }
    for (let index = 16; index < 80; index++) {
      const s0 = rotateRight64(words[index - 15], 1n) ^ rotateRight64(words[index - 15], 8n) ^ shiftRight64(words[index - 15], 7n);
      const s1 = rotateRight64(words[index - 2], 19n) ^ rotateRight64(words[index - 2], 61n) ^ shiftRight64(words[index - 2], 6n);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) & UINT64_MASK;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 80; index++) {
      const s1 = rotateRight64(e, 14n) ^ rotateRight64(e, 18n) ^ rotateRight64(e, 41n);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA512_ROUND_CONSTANTS[index] + words[index]) & UINT64_MASK;
      const s0 = rotateRight64(a, 28n) ^ rotateRight64(a, 34n) ^ rotateRight64(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) & UINT64_MASK;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) & UINT64_MASK;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) & UINT64_MASK;
    }

    hash[0] = (hash[0] + a) & UINT64_MASK;
    hash[1] = (hash[1] + b) & UINT64_MASK;
    hash[2] = (hash[2] + c) & UINT64_MASK;
    hash[3] = (hash[3] + d) & UINT64_MASK;
    hash[4] = (hash[4] + e) & UINT64_MASK;
    hash[5] = (hash[5] + f) & UINT64_MASK;
    hash[6] = (hash[6] + g) & UINT64_MASK;
    hash[7] = (hash[7] + h) & UINT64_MASK;
  }

  const digest = new Uint8Array(64);
  hash.forEach((value, index) => writeUint64(digest, index * 8, value));
  return digest;
}

function hmacSha512(key: Uint8Array, message: Uint8Array): Uint8Array {
  const normalizedKey = key.length > SHA512_BLOCK_BYTES ? sha512(key) : key;
  const keyBlock = new Uint8Array(SHA512_BLOCK_BYTES);
  keyBlock.set(normalizedKey);

  const outerPad = new Uint8Array(SHA512_BLOCK_BYTES);
  const innerPad = new Uint8Array(SHA512_BLOCK_BYTES);
  for (let index = 0; index < SHA512_BLOCK_BYTES; index++) {
    outerPad[index] = keyBlock[index] ^ 0x5c;
    innerPad[index] = keyBlock[index] ^ 0x36;
  }

  const innerMessage = new Uint8Array(innerPad.length + message.length);
  innerMessage.set(innerPad);
  innerMessage.set(message, innerPad.length);
  const innerHash = sha512(innerMessage);

  const outerMessage = new Uint8Array(outerPad.length + innerHash.length);
  outerMessage.set(outerPad);
  outerMessage.set(innerHash, outerPad.length);
  return sha512(outerMessage);
}

function normalizeAlgorithm(value: string | undefined): TOTPAlgorithm {
  const normalized = (value || 'SHA1').replace(/[-_]/g, '').toUpperCase();
  if (normalized === 'SHA1') return 'SHA1';
  if (normalized === 'SHA256') return 'SHA256';
  if (normalized === 'SHA512') return 'SHA512';
  throw new Error('Unsupported TOTP algorithm.');
}

function digestTotp(key: Uint8Array, message: Uint8Array, algorithm: TOTPAlgorithm): Uint8Array {
  if (algorithm === 'SHA256') return hmacSha256(key, message);
  if (algorithm === 'SHA512') return hmacSha512(key, message);
  return hmacSha1(key, message);
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
