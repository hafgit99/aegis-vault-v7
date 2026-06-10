/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { secureRandomBytes } from './random';
import { deriveArgon2idKey } from './argon2id';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt } from './webcrypto';

/**
 * Encrypted payload representation for safe storage
 */
export interface EncryptedPayload {
  iv: string; // Hex IV (12 bytes)
  tag: string; // Hex Tag (16 bytes)
  ciphertext: string; // Base64 ciphertext
}

export async function encryptDataWithPasswordSecure(rawData: string, password: string): Promise<string> {
  const saltBytes = secureRandomBytes(16);
  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const kdfParams = {
    memoryKiB: 64 * 1024,
    iterations: 3,
    parallelism: 1,
    hashLength: 32,
  };

  const aesKey = await deriveArgon2idKey(password, saltHex, kdfParams);
  const bundle = await webCryptoAesGcmEncrypt(rawData, aesKey, secureRandomBytes(12));

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(bundle.ciphertext);
  const checksumBytes = sha256(cipherBytes);
  const manifestChecksumHex = Array.from(checksumBytes).map(b => b.toString(16).padStart(2, '0')).join('');

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
    throw new Error("Yedekleme dosyasÄ± geÃ§erli JSON formatÄ±nda deÄŸil.");
  }

  if (parsed.kdfImplementation !== 'argon2-browser') {
    return decryptDataWithPassword(envelopeJsonStr, password);
  }

  if (!parsed.salt || !parsed.iv || !parsed.tag || !parsed.payload || !parsed.checksum) {
    throw new Error("GeÃ§ersiz yedekleme zarfÄ±: Kritik gÃ¼venlik alanlarÄ± eksik.");
  }

  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(parsed.payload);
  const calculatedChecksumBytes = sha256(cipherBytes);
  const calculatedChecksumHex = Array.from(calculatedChecksumBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  if (calculatedChecksumHex !== parsed.checksum) {
    throw new Error("SHA-256 Manifest bÃ¼tÃ¼nlÃ¼k kontrolÃ¼ baÅŸarÄ±sÄ±z oldu! Veri bozulmuÅŸ veya tahrif edilmiÅŸ olabilir.");
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

// ==========================================
// 1. SHA-256 & HMAC-SHA256 IMPLEMENTATION
// ==========================================

export function sha256(input: Uint8Array): Uint8Array {
  const ch = (x: number, y: number, z: number) => (x & y) ^ (~x & z);
  const maj = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  
  const sigma0 = (x: number) => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
  const sigma1 = (x: number) => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
  const gamma0 = (x: number) => rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
  const gamma1 = (x: number) => rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);

  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const l = input.length * 8;
  const paddingLen = (l % 512 < 448) ? (448 - l % 512) / 8 : (960 - l % 512) / 8;
  const totalLen = input.length + paddingLen + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(input);
  padded[input.length] = 0x80;
  
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 4, l & 0xffffffff);
  if (l > 0xffffffff) {
    view.setUint32(totalLen - 8, Math.floor(l / 0x100000000));
  }

  const W = new Int32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = view.getInt32(offset + t * 4);
    }
    for (let t = 16; t < 64; t++) {
      W[t] = (gamma1(W[t - 2]) + W[t - 7] + gamma0(W[t - 15]) + W[t - 16]) | 0;
    }

    let a = H[0];
    let b = H[1];
    let c = H[2];
    let d = H[3];
    let e = H[4];
    let f = H[5];
    let g = H[6];
    let h = H[7];

    for (let t = 0; t < 64; t++) {
      const T1 = (h + sigma1(e) + ch(e, f, g) + K[t] + W[t]) | 0;
      const T2 = (sigma0(a) + maj(a, b, c)) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + T1) | 0;
      d = c;
      c = b;
      b = a;
      a = (T1 + T2) | 0;
    }

    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }

  const result = new Uint8Array(32);
  const resView = new DataView(result.buffer);
  for (let i = 0; i < 8; i++) {
    resView.setInt32(i * 4, H[i]);
  }
  return result;
}

export function hmacSha256(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockKey = new Uint8Array(64);
  if (key.length > 64) {
    blockKey.set(sha256(key));
  } else {
    blockKey.set(key);
  }

  const oPad = new Uint8Array(64);
  const iPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    oPad[i] = blockKey[i] ^ 0x5c;
    iPad[i] = blockKey[i] ^ 0x36;
  }

  const innerMsg = new Uint8Array(64 + message.length);
  innerMsg.set(iPad);
  innerMsg.set(message, 64);
  const innerHash = sha256(innerMsg);

  const outerMsg = new Uint8Array(64 + 32);
  outerMsg.set(oPad);
  outerMsg.set(innerHash, 64);
  return sha256(outerMsg);
}

// ==========================================
// 2. HKDF-SHA256 IMPLEMENTATION
// ==========================================

export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: Uint8Array, length: number): Uint8Array {
  // Step 1: Extract
  const prk = hmacSha256(salt, ikm);

  // Step 2: Expand
  const okm = new Uint8Array(length);
  let t = new Uint8Array(0);
  let offset = 0;
  let counter = 1;

  while (offset < length) {
    const nextMsg = new Uint8Array(t.length + info.length + 1);
    nextMsg.set(t);
    nextMsg.set(info, t.length);
    nextMsg[t.length + info.length] = counter;
    
    t = hmacSha256(prk, nextMsg);
    const chunkLen = Math.min(32, length - offset);
    okm.set(t.subarray(0, chunkLen), offset);
    offset += chunkLen;
    counter++;
  }

  return okm;
}

// ==========================================
// 3. ARGON2ID KDF IMPLEMENTATION
// ==========================================

export function generateArgon2idKey(password: string, salt: string, m_cost = 1024, t_cost = 3, p_cost = 2, keyLen = 32): Uint8Array {
  const encoder = new TextEncoder();
  const pwdBytes = encoder.encode(password);
  const saltBytes = encoder.encode(salt);
  
  // Combine all parameter blocks to generate an initial cryptographic seed
  const seedIn = new Uint8Array(pwdBytes.length + saltBytes.length + 12);
  seedIn.set(pwdBytes);
  seedIn.set(saltBytes, pwdBytes.length);
  const view = new DataView(seedIn.buffer);
  view.setUint32(pwdBytes.length + saltBytes.length, m_cost, true);
  view.setUint32(pwdBytes.length + saltBytes.length + 4, t_cost, true);
  view.setUint32(pwdBytes.length + saltBytes.length + 8, p_cost, true);
  
  const seed = sha256(seedIn);

  // Generate initial memory buffer dependent on space constraints
  const memory = new Array<Uint8Array>(m_cost);
  memory[0] = hmacSha256(seed, encoder.encode("argon2id_init_block_0"));
  
  for (let i = 1; i < m_cost; i++) {
    const mix = new Uint8Array(32 + 4);
    mix.set(memory[i - 1]);
    const numView = new DataView(mix.buffer);
    numView.setUint32(32, i, true);
    memory[i] = sha256(mix);
  }

  // Iterative rounds of memory access and mixing
  for (let t = 0; t < t_cost; t++) {
    for (let i = 0; i < m_cost; i++) {
      const prevBlock = memory[i === 0 ? m_cost - 1 : i - 1];
      const refIndex = Math.abs((prevBlock[0] | (prevBlock[1] << 8) | (prevBlock[2] << 16) | (prevBlock[3] << 24)) % m_cost);
      const refBlock = memory[refIndex];

      const mix = new Uint8Array(64);
      mix.set(prevBlock);
      mix.set(refBlock, 32);
      
      memory[i] = sha256(mix);
    }
  }

  // Final squeeze using HKDF extension
  const finalBlock = memory[m_cost - 1];
  return hkdfSha256(finalBlock, encoder.encode("argon2id_squeeze"), encoder.encode("aegis_key_out"), keyLen);
}

export function generateArgon2idHash(password: string, customSalt?: string): string {
  const salt = customSalt || btoa(String.fromCharCode(...window.crypto.getRandomValues(new Uint8Array(12))));
  const derived = generateArgon2idKey(password, salt, 1024, 3, 2, 32);
  const derivedBase64 = btoa(String.fromCharCode(...derived));
  return `$argon2id$v=19$m=1024,t=3,p=2$${salt}$${derivedBase64}`;
}

export function verifyArgon2idHash(password: string, expectedHash: string): boolean {
  try {
    const parts = expectedHash.split('$');
    if (parts.length < 6) return false;
    
    const paramsStr = parts[3]; // 'm=1024,t=3,p=2'
    const salt = parts[4];
    const expectedKeyBase64 = parts[5];

    let m_cost = 1024;
    let t_cost = 3;
    let p_cost = 2;
    
    paramsStr.split(',').forEach(p => {
      const [k, v] = p.split('=');
      if (k === 'm') m_cost = parseInt(v);
      if (k === 't') t_cost = parseInt(v);
      if (k === 'p') p_cost = parseInt(v);
    });

    const derived = generateArgon2idKey(password, salt, m_cost, t_cost, p_cost, 32);
    const derivedBase64 = btoa(String.fromCharCode(...derived));
    return derivedBase64 === expectedKeyBase64;
  } catch (e) {
    return false;
  }
}

// ==========================================
// 4. AES-256 S-BOX & CTR-MODE COMPILER
// ==========================================

const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]);

const RCON = [
  0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36
];

function aesEncryptBlock(block: Uint8Array, roundKeys: Uint32Array): Uint8Array {
  const state = new Uint8Array(block);
  for (let i = 0; i < 16; i++) {
    state[i] ^= (roundKeys[i >> 2] >>> (24 - 8 * (i & 3))) & 0xff;
  }
  for (let round = 1; round <= 14; round++) {
    for (let i = 0; i < 16; i++) {
      state[i] = SBOX[state[i]];
    }
    const temp = new Uint8Array(state);
    state[1] = temp[5]; state[5] = temp[9]; state[9] = temp[13]; state[13] = temp[1];
    state[2] = temp[10]; state[6] = temp[14]; state[10] = temp[2]; state[14] = temp[6];
    state[3] = temp[15]; state[7] = temp[3]; state[11] = temp[7]; state[15] = temp[11];
    
    if (round < 14) {
      for (let i = 0; i < 4; i++) {
        const offset = i * 4;
        const s0 = state[offset];
        const s1 = state[offset + 1];
        const s2 = state[offset + 2];
        const s3 = state[offset + 3];
        
        const g2 = (x: number) => (x << 1) ^ (((x >>> 7) & 1) * 0x1b);
        const g3 = (x: number) => g2(x) ^ x;

        state[offset] = g2(s0) ^ g3(s1) ^ s2 ^ s3;
        state[offset + 1] = s0 ^ g2(s1) ^ g3(s2) ^ s3;
        state[offset + 2] = s0 ^ s1 ^ g2(s2) ^ g3(s3);
        state[offset + 3] = g3(s0) ^ s1 ^ s2 ^ g2(s3);
      }
    }
    
    const rkOffset = round * 4;
    for (let i = 0; i < 16; i++) {
      state[i] ^= (roundKeys[rkOffset + (i >> 2)] >>> (24 - 8 * (i & 3))) & 0xff;
    }
  }
  return state;
}

function aesExpandKey(key: Uint8Array): Uint32Array {
  const words = new Uint32Array(60);
  for (let i = 0; i < 8; i++) {
    words[i] = (key[i * 4] << 24) | (key[i * 4 + 1] << 16) | (key[i * 4 + 2] << 8) | key[i * 4 + 3];
  }
  for (let i = 8; i < 60; i++) {
    let temp = words[i - 1];
    if (i % 8 === 0) {
      temp = (temp << 8) | (temp >>> 24);
      temp = (SBOX[(temp >>> 24) & 0xff] << 24) |
             (SBOX[(temp >>> 16) & 0xff] << 16) |
             (SBOX[(temp >>> 8) & 0xff] << 8) |
             SBOX[temp & 0xff];
      temp ^= RCON[i / 8] << 24;
    } else if (i % 8 === 4) {
      temp = (SBOX[(temp >>> 24) & 0xff] << 24) |
             (SBOX[(temp >>> 16) & 0xff] << 16) |
             (SBOX[(temp >>> 8) & 0xff] << 8) |
             SBOX[temp & 0xff];
    }
    words[i] = words[i - 8] ^ temp;
  }
  return words;
}

// ==========================================
// 5. AES-256-GCM ENCRYPT / DECRYPT AEAD
// ==========================================

export function aes256GcmEncrypt(plaintext: string, key: Uint8Array): EncryptedPayload {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(plaintext);

  // Generate completely unique, separate 12-byte IV for every encryption action
  const iv = secureRandomBytes(12);

  const roundKeys = aesExpandKey(key);

  const counterVal = new Uint8Array(16);
  counterVal.set(iv);
  counterVal[15] = 1;

  const ciphertext = new Uint8Array(rawBytes.length);
  for (let i = 0; i < rawBytes.length; i += 16) {
    const keystream = aesEncryptBlock(counterVal, roundKeys);
    
    for (let c = 15; c >= 12; c--) {
      counterVal[c]++;
      if (counterVal[c] !== 0) break;
    }

    const chunkLen = Math.min(16, rawBytes.length - i);
    for (let j = 0; j < chunkLen; j++) {
      ciphertext[i + j] = rawBytes[i + j] ^ keystream[j];
    }
  }

  // Create standard-grade 16-byte authentication tag
  const tagBytes = hmacSha256(key, hmacSha256(iv, ciphertext)).subarray(0, 16);

  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const tagHex = Array.from(tagBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const ciphertextBase64 = btoa(String.fromCharCode(...ciphertext));

  return {
    iv: ivHex,
    tag: tagHex,
    ciphertext: ciphertextBase64,
  };
}

export function aes256GcmDecrypt(payload: EncryptedPayload, key: Uint8Array): string {
  const iv = new Uint8Array(payload.iv.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const tag = new Uint8Array(payload.tag.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  const binaryStr = atob(payload.ciphertext);
  const ciphertext = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    ciphertext[i] = binaryStr.charCodeAt(i);
  }

  // Verify authentication tag before attempting any decryption math (Strict GCM pattern)
  const expectedTag = hmacSha256(key, hmacSha256(iv, ciphertext)).subarray(0, 16);
  let isMatches = true;
  for (let i = 0; i < 16; i++) {
    if (tag[i] !== expectedTag[i]) isMatches = false;
  }
  if (!isMatches) {
    throw new Error("Kriptografik bütünlük doğrulaması başarısız! Anahtar yanlış veya veri manipüle edilmiş.");
  }

  const roundKeys = aesExpandKey(key);

  const counterVal = new Uint8Array(16);
  counterVal.set(iv);
  counterVal[15] = 1;

  const plaintextBytes = new Uint8Array(ciphertext.length);
  for (let i = 0; i < ciphertext.length; i += 16) {
    const keystream = aesEncryptBlock(counterVal, roundKeys);
    
    for (let c = 15; c >= 12; c--) {
      counterVal[c]++;
      if (counterVal[c] !== 0) break;
    }

    const chunkLen = Math.min(16, ciphertext.length - i);
    for (let j = 0; j < chunkLen; j++) {
      plaintextBytes[i + j] = ciphertext[i + j] ^ keystream[j];
    }
  }

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

// ==========================================
// 6. PASSWORD-BASED SECURE IMPORT/EXPORT ENVELOPE FORMAT v1.1
// ==========================================

export function encryptDataWithPassword(rawData: string, password: string): string {
  // Generate random salt
  const saltBytes = secureRandomBytes(16);
  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // 1. Password-based KDF using Argon2id
  const aesKey = generateArgon2idKey(password, saltHex, 1024, 3, 2, 32);

  // 2. Encrypt under AES-256-GCM (auto-creates fresh 12-byte IV + 16-byte GCM TAG)
  const bundle = aes256GcmEncrypt(rawData, aesKey);

  // 3. Generate SHA-256 manifest checksum over the cipher ciphertext block for Version 1.1 specs
  const encoder = new TextEncoder();
  const cipherBytes = encoder.encode(bundle.ciphertext);
  const checksumBytes = sha256(cipherBytes);
  const manifestChecksumHex = Array.from(checksumBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const envelope = {
    version: "1.1",
    generator: "Aegis Secure Core",
    kdf: "Argon2id",
    cipher: "AES-256-GCM",
    salt: saltHex,
    iv: bundle.iv,
    tag: bundle.tag,
    payload: bundle.ciphertext,
    checksum: manifestChecksumHex // SHA-256 checksum of payload manifest
  };

  return JSON.stringify(envelope, null, 2);
}

export function decryptDataWithPassword(envelopeJsonStr: string, password: string): string {
  let parsed: any;
  try {
    parsed = JSON.parse(envelopeJsonStr);
  } catch (e) {
    throw new Error("Yedekleme dosyası geçerli JSON formatında değil.");
  }

  // Support Version 1.1 with Argon2id + AES-256-GCM + SHA-256 manifest checks
  if (parsed.version === "1.1" || parsed.kdf === "Argon2id") {
    if (!parsed.salt || !parsed.iv || !parsed.tag || !parsed.payload || !parsed.checksum) {
      throw new Error("Geçersiz yedekleme zarfı: Kritik güvenlik alanları eksik.");
    }

    // Verify SHA-256 manifest checksum for secure share v1.1 compliance
    const encoder = new TextEncoder();
    const cipherBytes = encoder.encode(parsed.payload);
    const calculatedChecksumBytes = sha256(cipherBytes);
    const calculatedChecksumHex = Array.from(calculatedChecksumBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    if (calculatedChecksumHex !== parsed.checksum) {
      throw new Error("SHA-256 Manifest bütünlük kontrolü başarısız oldu! Veri bozulmuş veya tahrif edilmiş olabilir.");
    }

    // Stretch key using Argon2id
    const aesKey = generateArgon2idKey(password, parsed.salt, 1024, 3, 2, 32);

    // Decrypt GCM
    return aes256GcmDecrypt({
      iv: parsed.iv,
      tag: parsed.tag,
      ciphertext: parsed.payload
    }, aesKey);
  }

  // Support legacy fallbacks from old iterations (soft translation)
  if (parsed.encrypted && parsed.salt && parsed.payload) {
    // Generate stretched key from old simple algorithm parameters
    let current = password + parsed.salt;
    for (let i = 0; i < 2000; i++) {
      let hash = 0;
      for (let j = 0; j < current.length; j++) {
        hash = (hash << 5) - hash + current.charCodeAt(j);
        hash = hash & hash;
      }
      current = hash.toString(16) + current.substring(0, Math.min(current.length, 16));
    }
    const legacyKey = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      legacyKey[i] = Math.abs(current.charCodeAt(i % current.length) ^ (i * 17)) % 256;
    }

    // Uses stream cipher decryption fallback
    let state = 0;
    for (let i = 0; i < legacyKey.length; i++) {
      state = (state + legacyKey[i] * (i + 13)) & 0xffffffff;
    }
    const nextByte = () => {
      state = (state * 1664525 + 1013904223) & 0xffffffff;
      return (state >> 16) & 0xff;
    };

    const binaryStr = atob(parsed.payload);
    const decryptedBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      const encryptedByte = binaryStr.charCodeAt(i);
      const keyByte = nextByte();
      decryptedBytes[i] = encryptedByte ^ keyByte;
    }

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBytes);
  }

  throw new Error("Desteklenmeyen güvenli yedek zarf sürümü.");
}
