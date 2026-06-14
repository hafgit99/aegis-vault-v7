export function secureRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(Math.max(0, length));
  const cryptoApi = globalThis.crypto;

  if (!cryptoApi?.getRandomValues) {
    throw new Error('CSPRNG not available. Aegis Vault requires crypto.getRandomValues.');
  }

  cryptoApi.getRandomValues(bytes);
  return bytes;
}

export function secureRandomIndex(max: number): number {
  if (max <= 0) return 0;

  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) {
    throw new Error('CSPRNG not available. Aegis Vault requires crypto.getRandomValues.');
  }

  const array = new Uint32Array(1);
  const limit = Math.floor(0xffffffff / max) * max;

  do {
    cryptoApi.getRandomValues(array);
  } while (array[0] >= limit);

  return array[0] % max;
}

export function secureRandomId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const bytes = secureRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function secureRandomToken(length = 12): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = secureRandomBytes(length);
  let token = '';
  for (let i = 0; i < length; i++) {
    token += alphabet[bytes[i] % alphabet.length];
  }
  return token;
}
