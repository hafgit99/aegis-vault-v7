/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { decryptLegacyAes256Gcm, hmacSha256 } from './legacyCrypto';
import { secureRandomBytes } from './random';
import { APP_NAME, APP_SHORT_NAME } from './branding';
import { webCryptoAesGcmDecrypt, webCryptoAesGcmEncrypt, type WebCryptoAesGcmPayload } from './webcrypto';

export const biometricErrorCodes = {
  unsupported: 'biometric.unsupported',
  registrationCancelled: 'biometric.registrationCancelled',
  missingBundle: 'biometric.missingBundle',
  authenticationCancelled: 'biometric.authenticationCancelled',
  integrityMismatch: 'biometric.integrityMismatch',
} as const;

export type BiometricErrorCode = (typeof biometricErrorCodes)[keyof typeof biometricErrorCodes];

export class BiometricError extends Error {
  constructor(public readonly code: BiometricErrorCode) {
    super(code);
    this.name = 'BiometricError';
  }
}

/**
 * PBKDF2-SHA256 Implementation using pure TS hmacSha256
 */
export function pbkdf2Sha256(password: Uint8Array, salt: Uint8Array, iterations: number, keyLen: number): Uint8Array {
  const hLen = 32; // SHA-256 length is 32 bytes
  const l = Math.ceil(keyLen / hLen);
  const dk = new Uint8Array(keyLen);
  
  for (let i = 1; i <= l; i++) {
    // block number as big-endian 32-bit integer
    const blockNum = new Uint8Array(4);
    blockNum[0] = (i >>> 24) & 0xff;
    blockNum[1] = (i >>> 16) & 0xff;
    blockNum[2] = (i >>> 8) & 0xff;
    blockNum[3] = i & 0xff;
    
    const salted = new Uint8Array(salt.length + blockNum.length);
    salted.set(salt, 0);
    salted.set(blockNum, salt.length);
    
    let u = hmacSha256(password, salted);
    const t = new Uint8Array(u);
    
    for (let j = 2; j <= iterations; j++) {
      u = hmacSha256(password, u);
      for (let k = 0; k < hLen; k++) {
        t[k] ^= u[k];
      }
    }
    
    const offset = (i - 1) * hLen;
    const chunkLen = Math.min(hLen, keyLen - offset);
    dk.set(t.subarray(0, chunkLen), offset);
  }
  
  return dk;
}

async function deriveWebCryptoPbkdf2Key(password: Uint8Array, salt: Uint8Array, iterations: number, keyLen: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations,
    },
    keyMaterial,
    keyLen * 8,
  );

  return new Uint8Array(bits);
}

interface BiometricInfoV2 {
  version: 2;
  kdf: 'WebCrypto PBKDF2-SHA256';
  cipher: 'WebCrypto AES-256-GCM';
  credentialId: string;
  salt: string;
  bundle: WebCryptoAesGcmPayload;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  return new Uint8Array(atob(value).split('').map((char) => char.charCodeAt(0)));
}

export function isBiometricSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

export function isBiometricEnabled(): boolean {
  return localStorage.getItem('aegis_biometric_info') !== null;
}

export function disableBiometric(): void {
  localStorage.removeItem('aegis_biometric_info');
}

export async function registerBiometric(masterPassword: string): Promise<void> {
  if (!isBiometricSupported()) {
    throw new BiometricError(biometricErrorCodes.unsupported);
  }

  // Create a randomized challenge
  const challenge = secureRandomBytes(32);

  // Create a randomized userId
  const userId = secureRandomBytes(16);

  const creationOptions: CredentialCreationOptions = {
    publicKey: {
      challenge: challenge,
      rp: {
        name: APP_NAME,
      },
      user: {
        id: userId,
        name: "aegis_user_" + Date.now(),
        displayName: `${APP_SHORT_NAME} User`,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" }, // ES256
        { alg: -257, type: "public-key" }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform", // platform-specific (Touch ID, Windows Hello, Face ID)
        userVerification: "required",
      },
      timeout: 60000,
    }
  };

  const credential = await navigator.credentials.create(creationOptions) as PublicKeyCredential;
  if (!credential) {
    throw new BiometricError(biometricErrorCodes.registrationCancelled);
  }

  // Use rawId to derive the secure AES-256 wrapping key
  const rawIdBytes = new Uint8Array(credential.rawId);
  
  // Clean generated 16-byte random salt for PBKDF2-SHA256
  const salt = secureRandomBytes(16);

  const wrappingKey = await deriveWebCryptoPbkdf2Key(rawIdBytes, salt, 10000, 32);

  const bundle = await webCryptoAesGcmEncrypt(masterPassword, wrappingKey, secureRandomBytes(12));

  const biometricInfo: BiometricInfoV2 = {
    version: 2,
    kdf: 'WebCrypto PBKDF2-SHA256',
    cipher: 'WebCrypto AES-256-GCM',
    credentialId: bytesToBase64(new Uint8Array(credential.rawId)),
    salt: bytesToBase64(salt),
    bundle: bundle
  };

  localStorage.setItem('aegis_biometric_info', JSON.stringify(biometricInfo));
}

export async function authenticateBiometric(): Promise<string> {
  const storedStr = localStorage.getItem('aegis_biometric_info');
  if (!storedStr) {
    throw new BiometricError(biometricErrorCodes.missingBundle);
  }

  const biometricInfo = JSON.parse(storedStr);
  const credIdBytes = base64ToBytes(biometricInfo.credentialId);
  const saltBytes = base64ToBytes(biometricInfo.salt);

  const challenge = secureRandomBytes(32);

  const requestOptions: CredentialRequestOptions = {
    publicKey: {
      challenge: challenge,
      allowCredentials: [
        {
          id: credIdBytes,
          type: "public-key",
        }
      ],
      userVerification: "required",
      timeout: 60000,
    }
  };

  const assertion = await navigator.credentials.get(requestOptions) as PublicKeyCredential;
  if (!assertion) {
    throw new BiometricError(biometricErrorCodes.authenticationCancelled);
  }

  const rawIdBytes = new Uint8Array(assertion.rawId);

  try {
    if (biometricInfo.version === 2 && biometricInfo.cipher === 'WebCrypto AES-256-GCM') {
      const wrappingKey = await deriveWebCryptoPbkdf2Key(rawIdBytes, saltBytes, 10000, 32);
      return webCryptoAesGcmDecrypt(biometricInfo.bundle, wrappingKey);
    }

    const legacyWrappingKey = pbkdf2Sha256(rawIdBytes, saltBytes, 10000, 32);
    return decryptLegacyAes256Gcm(biometricInfo.bundle, legacyWrappingKey);
  } catch (e) {
    throw new BiometricError(biometricErrorCodes.integrityMismatch);
  }
}
