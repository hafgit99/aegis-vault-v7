import { secureRandomBytes } from './random';
import { registerOnCloseSession } from './vaultSession';

export interface WebCryptoAesGcmPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

export interface WebCryptoAesGcmBytesPayload {
  iv: string;
  tag: string;
  ciphertext: ArrayBuffer;
}

const AUTH_TAG_BYTES = 16;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  const chunks = hex.match(/.{1,2}/g) ?? [];
  return new Uint8Array(chunks.map((byte) => parseInt(byte, 16)));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

interface CacheEntry {
  key: CryptoKey;
  freq: number;
}

// Cache for imported WebCrypto keys to avoid heavy importKey microtasks during bulk operations.
const importedKeysCache = new Map<string, CacheEntry>();

export function clearImportedAesGcmKeyCache(): void {
  importedKeysCache.clear();
}

export function getImportedAesGcmKeyCacheSizeForTest(): number {
  return importedKeysCache.size;
}

registerOnCloseSession(clearImportedAesGcmKeyCache);

async function importAesGcmKey(rawKey: Uint8Array): Promise<CryptoKey> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', rawKey);
  const cacheKey = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  const cachedEntry = importedKeysCache.get(cacheKey);
  if (cachedEntry) {
    cachedEntry.freq++;
    return cachedEntry.key;
  }

  const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  
  // Bound cache size using LFU (Least Frequently Used) eviction strategy
  if (importedKeysCache.size >= 20) {
    let minFreq = Infinity;
    let minKey: string | null = null;

    for (const [k, entry] of importedKeysCache.entries()) {
      if (entry.freq < minFreq) {
        minFreq = entry.freq;
        minKey = k;
      }
    }

    if (minKey !== null) {
      importedKeysCache.delete(minKey);
    }
  }
  
  importedKeysCache.set(cacheKey, { key, freq: 1 });
  return key;
}

export async function webCryptoAesGcmEncrypt(
  plaintext: string,
  rawKey: Uint8Array,
  iv: Uint8Array,
): Promise<WebCryptoAesGcmPayload> {
  const key = await importAesGcmKey(rawKey);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, plaintextBytes),
  );
  const ciphertext = encrypted.slice(0, encrypted.length - AUTH_TAG_BYTES);
  const tag = encrypted.slice(encrypted.length - AUTH_TAG_BYTES);

  return {
    iv: bytesToHex(iv),
    tag: bytesToHex(tag),
    ciphertext: bytesToBase64(ciphertext),
  };
}

export async function webCryptoAesGcmDecrypt(
  payload: WebCryptoAesGcmPayload,
  rawKey: Uint8Array,
): Promise<string> {
  const key = await importAesGcmKey(rawKey);
  const iv = hexToBytes(payload.iv);
  const tag = hexToBytes(payload.tag);
  const ciphertext = base64ToBytes(payload.ciphertext);
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);

  const plaintextBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encrypted,
  );

  return new TextDecoder().decode(plaintextBytes);
}

export async function webCryptoAesGcmEncryptBytes(
  plaintext: ArrayBuffer | ArrayBufferView,
  rawKey: Uint8Array,
  iv: Uint8Array,
): Promise<WebCryptoAesGcmBytesPayload> {
  const key = await importAesGcmKey(rawKey);
  const dataToEncrypt = ArrayBuffer.isView(plaintext)
    ? new Uint8Array(plaintext.buffer, plaintext.byteOffset, plaintext.byteLength)
    : new Uint8Array(plaintext);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, dataToEncrypt),
  );
  const ciphertext = encrypted.slice(0, encrypted.length - AUTH_TAG_BYTES);
  const tag = encrypted.slice(encrypted.length - AUTH_TAG_BYTES);

  return {
    iv: bytesToHex(iv),
    tag: bytesToHex(tag),
    ciphertext: ciphertext.buffer.slice(ciphertext.byteOffset, ciphertext.byteOffset + ciphertext.byteLength),
  };
}

export async function webCryptoAesGcmDecryptBytes(
  payload: WebCryptoAesGcmBytesPayload,
  rawKey: Uint8Array,
): Promise<ArrayBuffer> {
  const key = await importAesGcmKey(rawKey);
  const iv = hexToBytes(payload.iv);
  const tag = hexToBytes(payload.tag);
  const ciphertext = new Uint8Array(payload.ciphertext);
  const encrypted = new Uint8Array(ciphertext.length + tag.length);
  encrypted.set(ciphertext);
  encrypted.set(tag, ciphertext.length);

  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encrypted);
  return plaintext;
}

export function generateSafeIv(): Uint8Array {
  return secureRandomBytes(12);
}

/**
 * Derives an isolated per-item key using HKDF-SHA256.
 * HKDF(masterKey, salt=itemId, info="aegis-item-key-v7") -> 32-byte per-item AES key
 */
export async function derivePerItemKey(
  masterKey: Uint8Array,
  itemId: string,
): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey('raw', masterKey, 'HKDF', false, ['deriveBits']);
  const salt = new TextEncoder().encode(itemId);
  const info = new TextEncoder().encode('aegis-item-key-v7');

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    ikm,
    256,
  );

  return new Uint8Array(bits);
}
