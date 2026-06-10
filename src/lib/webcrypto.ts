export interface WebCryptoAesGcmPayload {
  iv: string;
  tag: string;
  ciphertext: string;
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

async function importAesGcmKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
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
