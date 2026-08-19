/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VaultItem } from '../types';
import type { WebCryptoAesGcmPayload } from './webcrypto';
import { generateSafeIv, webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt } from './webcrypto';
import { secureRandomBytes } from './random';

export interface DecryptedSharePayload {
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  category: VaultItem['category'];
  totpSecret?: string;
  expiresAt: number;
}

/**
 * Encodes Uint8Array into a base64url string.
 */
export function base64urlEncode(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes a base64url string into a Uint8Array.
 */
export function base64urlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts a vault item using AES-GCM and generates a secure local share URL.
 */
export async function generateShareUrl(item: VaultItem, durationHours: number): Promise<string> {
  const expiresAt = Date.now() + durationHours * 3600 * 1000;
  const payload: DecryptedSharePayload = {
    title: item.title,
    username: item.username,
    password: item.password,
    url: item.url,
    notes: item.notes,
    category: item.category,
    totpSecret: item.totpSecret,
    expiresAt,
  };

  const plaintext = JSON.stringify(payload);
  const rawKey = secureRandomBytes(32);
  const iv = generateSafeIv();

  const encrypted = await webCryptoAesGcmEncrypt(plaintext, rawKey, iv);

  // Pack the encrypted payload (iv, tag, ciphertext)
  const bundle = JSON.stringify({
    i: encrypted.iv,
    t: encrypted.tag,
    c: encrypted.ciphertext,
  });

  const bundleBytes = new TextEncoder().encode(bundle);
  const d = base64urlEncode(bundleBytes);
  const k = base64urlEncode(rawKey);

  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}#share=${d}&k=${k}`;
}

/**
 * Decrypts a secure local share hash fragment into the original vault item.
 */
export async function decryptShareUrl(hash: string): Promise<DecryptedSharePayload | null> {
  try {
    const hashClean = hash.replace(/^#/, '');
    const params = new URLSearchParams(hashClean);
    const d = params.get('share');
    const k = params.get('k');

    if (!d || !k) return null;

    const bundleBytes = base64urlDecode(d);
    const bundleStr = new TextDecoder().decode(bundleBytes);
    const bundle = JSON.parse(bundleStr) as { i: string; t: string; c: string };

    const rawKey = base64urlDecode(k);

    const payload: WebCryptoAesGcmPayload = {
      iv: bundle.i,
      tag: bundle.t,
      ciphertext: bundle.c,
    };

    const plaintext = await webCryptoAesGcmDecrypt(payload, rawKey);
    const decrypted = JSON.parse(plaintext) as DecryptedSharePayload;

    if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
      return null;
    }

    return decrypted;
  } catch {
    return null;
  }
}
