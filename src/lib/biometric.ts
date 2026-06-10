/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { hmacSha256, aes256GcmEncrypt, aes256GcmDecrypt } from './encryption';
import { secureRandomBytes } from './random';
import { APP_NAME, APP_SHORT_NAME } from './branding';

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
    throw new Error("Tarayıcınız veya sisteminiz biyometrik doğrulama standartlarını (WebAuthn) desteklemiyor.");
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
    throw new Error("Biyometrik kilit kaydı iptal edildi veya başarısız oldu.");
  }

  // Use rawId to derive the secure AES-256 wrapping key
  const rawIdBytes = new Uint8Array(credential.rawId);
  
  // Clean generated 16-byte random salt for PBKDF2-SHA256
  const salt = secureRandomBytes(16);

  // Stretch key using PBKDF2-SHA256
  const wrappingKey = pbkdf2Sha256(rawIdBytes, salt, 10000, 32);

  // Wrap master password in AES-256-GCM
  const bundle = aes256GcmEncrypt(masterPassword, wrappingKey);

  // Convert array and values to base64
  const biometricInfo = {
    credentialId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
    salt: btoa(String.fromCharCode(...salt)),
    bundle: bundle
  };

  localStorage.setItem('aegis_biometric_info', JSON.stringify(biometricInfo));
}

export async function authenticateBiometric(): Promise<string> {
  const storedStr = localStorage.getItem('aegis_biometric_info');
  if (!storedStr) {
    throw new Error("Kayıtlı biyometrik kilit bulunamadı.");
  }

  const biometricInfo = JSON.parse(storedStr);
  const credIdBytes = new Uint8Array(atob(biometricInfo.credentialId).split("").map(c => c.charCodeAt(0)));
  const saltBytes = new Uint8Array(atob(biometricInfo.salt).split("").map(c => c.charCodeAt(0)));

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
    throw new Error("Biyometrik doğrulama iptal edildi veya reddedildi.");
  }

  const rawIdBytes = new Uint8Array(assertion.rawId);

  // Derive the exact encryption key again
  const wrappingKey = pbkdf2Sha256(rawIdBytes, saltBytes, 10000, 32);

  // Try decrypting GCM
  try {
    const masterPassword = aes256GcmDecrypt(biometricInfo.bundle, wrappingKey);
    return masterPassword;
  } catch (e) {
    throw new Error("Şifre çözme doğrulaması başarısız! Biyometrik veriler veya anahtar bütünlüğü eşleşmiyor.");
  }
}
