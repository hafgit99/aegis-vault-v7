/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512';

export function normalizeAlgorithm(value: string | undefined): TOTPAlgorithm {
  const normalized = (value || 'SHA1').replace(/[-_]/g, '').toUpperCase();
  if (normalized === 'SHA1') return 'SHA1';
  if (normalized === 'SHA256') return 'SHA256';
  if (normalized === 'SHA512') return 'SHA512';
  throw new Error('Unsupported TOTP algorithm.');
}

function getWebCryptoHashName(algorithm: TOTPAlgorithm): string {
  switch (algorithm) {
    case 'SHA1':
      return 'SHA-1';
    case 'SHA256':
      return 'SHA-256';
    case 'SHA512':
      return 'SHA-512';
  }
}

/**
 * Computes an HMAC digest for TOTP using native WebCrypto SubtleCrypto.
 * Returns a constant-time signature buffer without custom JS hash implementations.
 */
export async function digestTotp(
  key: Uint8Array,
  message: Uint8Array,
  algorithm: TOTPAlgorithm,
): Promise<Uint8Array> {
  const cryptoObj = globalThis.crypto;
  if (!cryptoObj?.subtle) {
    throw new Error('WebCrypto subtle is unavailable.');
  }

  const hashName = getWebCryptoHashName(algorithm);
  const cryptoKey = await cryptoObj.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: { name: hashName } },
    false,
    ['sign'],
  );

  const signature = await cryptoObj.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}
