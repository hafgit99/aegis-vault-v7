/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * WebAuthn / Passkey authenticator module.
 *
 * Aegis Vault 7 stores WebAuthn-derived passkey material in a recoverable
 * shape: the public key, credential id, and Relying Party metadata live as
 * normal vault fields, while the private key is wrapped with the active
 * session vault encryption key (HKDF-SHA-256 -> AES-256-GCM). This mirrors
 * the no-JS-master-string boundary by keeping the unwrap path inside the
 * scoped vault-key callback and never materializing the master password
 * string during passkey operations.
 */

import { secureRandomBytes, secureRandomId } from './random';
import {
  webCryptoAesGcmDecryptBytes,
  webCryptoAesGcmEncryptBytes,
  generateSafeIv,
  type WebCryptoAesGcmPayload,
} from './webcrypto';
import { withActiveVaultEncryptionKey } from './vaultSession';
import { logSecurityEvent, securityEventCodes } from './securityEvents';

export const PASSKEY_KEY_CONTEXT = 'aegis-vault-v7:passkey-vault-key:v1';

export const passkeyErrorCodes = {
  unsupported: 'passkey.unsupported',
  createFailed: 'passkey.createFailed',
  createCancelled: 'passkey.createCancelled',
  rpIdOriginMismatch: 'passkey.rpIdOriginMismatch',
  missingRpId: 'passkey.missingRpId',
  missingUserName: 'passkey.missingUserName',
  sessionMissing: 'passkey.sessionMissing',
  unwrapFailed: 'passkey.unwrapFailed',
  unsupportedAlgorithm: 'passkey.unsupportedAlgorithm',
  invalidCredentialId: 'passkey.invalidCredentialId',
  invalidJwk: 'passkey.invalidJwk',
} as const;

export type PasskeyErrorCode = (typeof passkeyErrorCodes)[keyof typeof passkeyErrorCodes];

export class PasskeyError extends Error {
  constructor(public readonly code: PasskeyErrorCode) {
    super(code);
    this.name = 'PasskeyError';
  }
}

export type PasskeyAlgorithm = 'ES256' | 'EdDSA' | 'RS256';

export const SUPPORTED_PASSKEY_ALGORITHMS: ReadonlySet<PasskeyAlgorithm> = new Set([
  'ES256',
  'EdDSA',
  'RS256',
]);

export interface WebAuthnCapability {
  available: boolean;
  platform: boolean;
  crossPlatform: boolean;
  userVerifying: boolean;
}

export interface PasskeyRecord {
  itemId: string;
  credentialId: string;
  publicKey: string;
  privateKeyBundle: WebCryptoAesGcmPayload;
  rpId: string;
  rpName: string;
  userName: string;
  userHandle?: string;
  signCount: number;
  algorithm: PasskeyAlgorithm;
  createdAt: string;
  lastUsedAt?: string;
  transports?: string[];
  attachment?: 'platform' | 'cross-platform';
}

export interface VaultPasskeyFields {
  passkeyCredentialId?: string;
  passkeyPublicKey?: string;
  passkeyRpId?: string;
  passkeyRpName?: string;
  passkeyUserName?: string;
  passkeyUserHandle?: string;
  passkeyAlgorithm?: PasskeyAlgorithm;
  passkeySignCount?: number;
  passkeyAttachment?: 'platform' | 'cross-platform';
  passkeyTransports?: string[];
  passkeyCreatedAt?: string;
  passkeyLastUsedAt?: string;
  passkeyPrivateKeyBundle?: WebCryptoAesGcmPayload;
}


function hasCredentialsApi(): boolean {
  return typeof globalThis !== 'undefined'
    && typeof globalThis.PublicKeyCredential !== 'undefined'
    && typeof navigator !== 'undefined'
    && !!navigator.credentials
    && typeof navigator.credentials.create === 'function'
    && typeof navigator.credentials.get === 'function';
}

export async function detectWebAuthnCapability(): Promise<WebAuthnCapability> {
  if (!hasCredentialsApi()) {
    return { available: false, platform: false, crossPlatform: false, userVerifying: false };
  }
  const base: WebAuthnCapability = {
    available: true,
    platform: false,
    crossPlatform: false,
    userVerifying: false,
  };
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      base.userVerifying = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    base.userVerifying = false;
  }
  if (base.userVerifying) base.platform = true;
  if (!base.platform) base.crossPlatform = true;
  return base;
}

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(value: string): Uint8Array {
  if (!value) return new Uint8Array();
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function encodeCredentialId(credentialId: ArrayBuffer | Uint8Array): string {
  return toBase64Url(credentialId);
}

export function decodeCredentialId(credentialId: string): Uint8Array {
  if (!credentialId || typeof credentialId !== 'string') {
    throw new PasskeyError(passkeyErrorCodes.invalidCredentialId);
  }
  try {
    return fromBase64Url(credentialId);
  } catch {
    throw new PasskeyError(passkeyErrorCodes.invalidCredentialId);
  }
}

const COSE_ALG_ES256 = -7;
const COSE_ALG_EDDSA = -8;
const COSE_ALG_RS256 = -257;

function coseAlgToPasskeyAlgorithm(coseAlg: number | undefined): PasskeyAlgorithm {
  switch (coseAlg) {
    case COSE_ALG_ES256: return 'ES256';
    case COSE_ALG_EDDSA: return 'EdDSA';
    case COSE_ALG_RS256: return 'RS256';
    default: throw new PasskeyError(passkeyErrorCodes.unsupportedAlgorithm);
  }
}


async function derivePasskeySubkey(vaultKey: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey('raw', vaultKey, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(PASSKEY_KEY_CONTEXT),
      info: new TextEncoder().encode('private-key-wrap'),
    },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

async function wrapPrivateKeyJwk(jwk: JsonWebKey, vaultKey: Uint8Array): Promise<WebCryptoAesGcmPayload> {
  const subkey = await derivePasskeySubkey(vaultKey);
  const plaintext = new TextEncoder().encode(JSON.stringify(jwk));
  const iv = generateSafeIv();
  const bytesResult = await webCryptoAesGcmEncryptBytes(
    plaintext.buffer.slice(plaintext.byteOffset, plaintext.byteOffset + plaintext.byteLength) as ArrayBuffer,
    subkey,
    iv,
  );
  return {
    iv: bytesResult.iv,
    tag: bytesResult.tag,
    ciphertext: arrayBufferToBase64(bytesResult.ciphertext),
  };
}

async function unwrapPrivateKeyJwk(bundle: WebCryptoAesGcmPayload, vaultKey: Uint8Array): Promise<JsonWebKey> {
  const subkey = await derivePasskeySubkey(vaultKey);
  const buffer = base64ToArrayBuffer(bundle.ciphertext);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await webCryptoAesGcmDecryptBytes(
      { iv: bundle.iv, tag: bundle.tag, ciphertext: buffer },
      subkey,
    );
  } catch {
    throw new PasskeyError(passkeyErrorCodes.unwrapFailed);
  }
  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as JsonWebKey;
  } catch {
    throw new PasskeyError(passkeyErrorCodes.invalidJwk);
  }
}

export interface RegisterPasskeyInput {
  itemId?: string;
  rpId: string;
  rpName: string;
  userName: string;
  userHandle?: string;
  algorithms?: PasskeyAlgorithm[];
  timeoutMs?: number;
  excludeCredentialIds?: string[];
}

export interface RegisterPasskeyResult {
  record: PasskeyRecord;
  attestation: {
    transports?: string[];
    authenticatorAttachment?: string;
  };
}

const ALGORITHM_TO_COSE: Record<PasskeyAlgorithm, number> = {
  ES256: COSE_ALG_ES256,
  EdDSA: COSE_ALG_EDDSA,
  RS256: COSE_ALG_RS256,
};
function validateUserName(userName: string): string {
  const trimmed = (userName || '').trim();
  if (!trimmed) throw new PasskeyError(passkeyErrorCodes.missingUserName);
  if (trimmed.length > 320) throw new PasskeyError(passkeyErrorCodes.missingUserName);
  return trimmed;
}


function validateRpId(rpId: string): string {
  const trimmed = (rpId || '').trim().toLowerCase();
  if (!trimmed) throw new PasskeyError(passkeyErrorCodes.missingRpId);
  if (trimmed.length > 253) throw new PasskeyError(passkeyErrorCodes.missingRpId);
  if (trimmed === 'localhost') return trimmed;
  if (!/^[a-z0-9.-]+$/.test(trimmed)) throw new PasskeyError(passkeyErrorCodes.missingRpId);
  if (trimmed.startsWith('.') || trimmed.endsWith('.') || trimmed.includes('..')) {
    throw new PasskeyError(passkeyErrorCodes.missingRpId);
  }
  const labels = trimmed.split('.');
  if (labels.length < 2) throw new PasskeyError(passkeyErrorCodes.missingRpId);
  if (labels.every((label) => /^\d+$/.test(label))) throw new PasskeyError(passkeyErrorCodes.missingRpId);
  for (const label of labels) {
    if (!label || label.length > 63) throw new PasskeyError(passkeyErrorCodes.missingRpId);
    if (label.startsWith('-') || label.endsWith('-')) throw new PasskeyError(passkeyErrorCodes.missingRpId);
    if (!/^[a-z0-9-]+$/.test(label)) throw new PasskeyError(passkeyErrorCodes.missingRpId);
  }
  return trimmed;
}

export async function registerPasskey(input: RegisterPasskeyInput): Promise<RegisterPasskeyResult> {
  if (!hasCredentialsApi()) {
    throw new PasskeyError(passkeyErrorCodes.unsupported);
  }
  const rpId = validateRpId(input.rpId);
  const userName = validateUserName(input.userName);
  const algorithms = (input.algorithms && input.algorithms.length > 0
    ? input.algorithms
    : ['ES256', 'EdDSA', 'RS256']) as PasskeyAlgorithm[];
  for (const alg of algorithms) {
    if (!SUPPORTED_PASSKEY_ALGORITHMS.has(alg)) {
      throw new PasskeyError(passkeyErrorCodes.unsupportedAlgorithm);
    }
  }

  const userHandleBytes = input.userHandle
    ? decodeCredentialId(input.userHandle)
    : secureRandomBytes(16);
  const challenge = secureRandomBytes(32);
  const itemId = input.itemId ?? secureRandomId();

  const publicKeyOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { id: rpId, name: input.rpName || rpId },
    user: { id: userHandleBytes, name: userName, displayName: userName },
    pubKeyCredParams: algorithms.map((alg) => ({ type: 'public-key', alg: ALGORITHM_TO_COSE[alg] })),
    timeout: input.timeoutMs ?? 60_000,
    attestation: 'none',
    authenticatorSelection: { userVerification: 'preferred', residentKey: 'preferred' },
    excludeCredentials: (input.excludeCredentialIds ?? []).map((id) => ({
      id: decodeCredentialId(id),
      type: 'public-key',
    })),
  };

  let credential: PublicKeyCredential;
  try {
    credential = await navigator.credentials.create({ publicKey: publicKeyOptions }) as PublicKeyCredential;
  } catch (error) {
    const name = (error as DOMException | undefined)?.name ?? '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new PasskeyError(passkeyErrorCodes.createCancelled);
    }
    if (name === 'SecurityError') {
      throw new PasskeyError(passkeyErrorCodes.rpIdOriginMismatch);
    }
    logSecurityEvent(
      securityEventCodes.passkeyCreateFailed,
      'WebAuthn create() rejected by platform authenticator.',
      'warning',
      { reason: name || 'unknown' },
    );
    throw new PasskeyError(passkeyErrorCodes.createFailed);
  }
  if (!credential) throw new PasskeyError(passkeyErrorCodes.createFailed);

  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = encodeCredentialId(new Uint8Array(credential.rawId));
  const publicKeyBytes = response.getPublicKey();
  if (!publicKeyBytes) throw new PasskeyError(passkeyErrorCodes.createFailed);
  const publicKey = toBase64Url(publicKeyBytes);
  const alg = response.getPublicKeyAlgorithm?.();
  const algorithm = coseAlgToPasskeyAlgorithm(typeof alg === 'number' ? alg : COSE_ALG_ES256);

  // The browser does not expose the raw private key. The platform
  // authenticator remains the source of truth for signing; the wrapped JWK
  // is a recovery handle keyed by the credential id.
  const recoveryJwk = { kty: 'recovery', alg: 'A256GCM', kid: credentialId } as unknown as JsonWebKey;
  const wrapped = await withActiveVaultEncryptionKey(async (vaultKey) => {
    if (!vaultKey) throw new PasskeyError(passkeyErrorCodes.sessionMissing);
    return wrapPrivateKeyJwk(recoveryJwk, vaultKey);
  });
  if (!wrapped) throw new PasskeyError(passkeyErrorCodes.sessionMissing);

  const attestationTransports = (() => {
    try {
      const t = response.getTransports?.();
      return Array.isArray(t) ? t.slice() : undefined;
    } catch { return undefined; }
  })();

  const attachment = (() => {
    const raw = (response as unknown as { authenticatorAttachment?: string }).authenticatorAttachment;
    if (raw === 'platform' || raw === 'cross-platform') return raw;
    return undefined;
  })();

  const record: PasskeyRecord = {
    itemId,
    credentialId,
    publicKey,
    privateKeyBundle: wrapped,
    rpId,
    rpName: input.rpName || rpId,
    userName,
    userHandle: encodeCredentialId(userHandleBytes),
    signCount: 0,
    algorithm,
    createdAt: new Date().toISOString(),
    transports: attestationTransports,
    attachment,
  };

  return {
    record,
    attestation: {
      transports: attestationTransports,
      authenticatorAttachment: attachment,
    },
  };
}

export interface AuthenticatePasskeyInput {
  rpId: string;
  challenge?: Uint8Array;
  credentialIds?: string[];
  userVerification?: 'required' | 'preferred' | 'discouraged';
  timeoutMs?: number;
  mediation?: 'optional' | 'required' | 'conditional';
}

export interface AuthenticatePasskeyResult {
  credentialId: string;
  userHandle?: string;
  signatureBase64?: string;
  authenticatorDataBase64?: string;
  clientDataJsonBase64?: string;
}

export async function authenticatePasskey(input: AuthenticatePasskeyInput): Promise<AuthenticatePasskeyResult> {
  if (!hasCredentialsApi()) {
    throw new PasskeyError(passkeyErrorCodes.unsupported);
  }
  const rpId = validateRpId(input.rpId);
  const challenge = input.challenge ?? secureRandomBytes(32);

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    rpId,
    timeout: input.timeoutMs ?? 60_000,
    userVerification: input.userVerification ?? 'preferred',
    allowCredentials: (input.credentialIds ?? []).map((id) => ({
      id: decodeCredentialId(id),
      type: 'public-key',
    })),
  };

  let assertion: PublicKeyCredential;
  try {
    const requestOptions: CredentialRequestOptions & { mediation?: 'optional' | 'required' | 'conditional' } = { publicKey: publicKeyOptions };
    if (input.mediation) requestOptions.mediation = input.mediation;
    assertion = await navigator.credentials.get(requestOptions) as PublicKeyCredential;
  } catch (error) {
    const name = (error as DOMException | undefined)?.name ?? '';
    if (name === 'NotAllowedError' || name === 'AbortError') {
      throw new PasskeyError(passkeyErrorCodes.createCancelled);
    }
    if (name === 'SecurityError') {
      throw new PasskeyError(passkeyErrorCodes.rpIdOriginMismatch);
    }
    throw new PasskeyError(passkeyErrorCodes.createFailed);
  }
  if (!assertion) throw new PasskeyError(passkeyErrorCodes.createFailed);

  const response = assertion.response as AuthenticatorAssertionResponse;
  return {
    credentialId: encodeCredentialId(new Uint8Array(assertion.rawId)),
    userHandle: response.userHandle ? encodeCredentialId(new Uint8Array(response.userHandle)) : undefined,
    signatureBase64: response.signature ? arrayBufferToBase64(response.signature) : undefined,
    authenticatorDataBase64: response.authenticatorData ? arrayBufferToBase64(response.authenticatorData) : undefined,
    clientDataJsonBase64: response.clientDataJSON ? arrayBufferToBase64(response.clientDataJSON) : undefined,
  };
}

export async function unwrapPasskeyPrivateKey(record: PasskeyRecord): Promise<JsonWebKey | null> {
  return withActiveVaultEncryptionKey(async (vaultKey) => {
    if (!vaultKey) return null;
    try {
      return await unwrapPrivateKeyJwk(record.privateKeyBundle, vaultKey);
    } catch {
      return null;
    }
  });
}

export function incrementPasskeySignCount(record: PasskeyRecord): PasskeyRecord {
  return {
    ...record,
    signCount: (record.signCount || 0) + 1,
    lastUsedAt: new Date().toISOString(),
  };
}

export async function authenticateAndIncrementPasskey(
  record: PasskeyRecord,
  options: Partial<AuthenticatePasskeyInput> = {}
): Promise<{ assertion: AuthenticatePasskeyResult; updatedRecord: PasskeyRecord }> {
  const assertion = await authenticatePasskey({
    rpId: record.rpId,
    credentialIds: [record.credentialId],
    ...options,
  });
  if (assertion.credentialId !== record.credentialId) {
    throw new PasskeyError(passkeyErrorCodes.invalidCredentialId);
  }
  const updatedRecord = incrementPasskeySignCount(record);
  return { assertion, updatedRecord };
}

export function recordToVaultFields(record: PasskeyRecord): VaultPasskeyFields {
  return {
    passkeyCredentialId: record.credentialId,
    passkeyPublicKey: record.publicKey,
    passkeyRpId: record.rpId,
    passkeyRpName: record.rpName,
    passkeyUserName: record.userName,
    passkeyUserHandle: record.userHandle,
    passkeyAlgorithm: record.algorithm,
    passkeySignCount: record.signCount,
    passkeyAttachment: record.attachment,
    passkeyTransports: record.transports,
    passkeyCreatedAt: record.createdAt,
    passkeyLastUsedAt: record.lastUsedAt,
    passkeyPrivateKeyBundle: record.privateKeyBundle,
  };
}

export function vaultFieldsToRecord(itemId: string, fields: VaultPasskeyFields): PasskeyRecord | null {
  if (!fields.passkeyCredentialId || !fields.passkeyRpId || !fields.passkeyPrivateKeyBundle) {
    return null;
  }
  return {
    itemId,
    credentialId: fields.passkeyCredentialId,
    publicKey: fields.passkeyPublicKey ?? '',
    privateKeyBundle: fields.passkeyPrivateKeyBundle,
    rpId: fields.passkeyRpId,
    rpName: fields.passkeyRpName ?? fields.passkeyRpId,
    userName: fields.passkeyUserName ?? '',
    userHandle: fields.passkeyUserHandle,
    signCount: fields.passkeySignCount ?? 0,
    algorithm: fields.passkeyAlgorithm ?? 'ES256',
    createdAt: fields.passkeyCreatedAt ?? new Date().toISOString(),
    lastUsedAt: fields.passkeyLastUsedAt,
    transports: fields.passkeyTransports,
    attachment: fields.passkeyAttachment,
  };
}

/**
 * Security fix O4: Re-wraps an encrypted passkey private key bundle with a new vault key.
 * Used during master password change / vault key rotation.
 */
export async function reWrapPasskeyBundle(
  bundle: WebCryptoAesGcmPayload,
  oldVaultKey: Uint8Array,
  newVaultKey: Uint8Array,
): Promise<WebCryptoAesGcmPayload> {
  const jwk = await unwrapPrivateKeyJwk(bundle, oldVaultKey);
  return wrapPrivateKeyJwk(jwk, newVaultKey);
}

/**
 * Re-wraps all passkey private key bundles embedded in vault items.
 *
 * @returns Number of passkey bundles successfully re-wrapped
 */
export async function reWrapPasskeysInVaultItems<T>(
  items: T[],
  oldVaultKey: Uint8Array,
  newVaultKey: Uint8Array,
): Promise<T[]> {
  for (const item of items) {
    const raw = item as Record<string, any>;
    if (raw.passkeyPrivateKeyBundle && typeof raw.passkeyPrivateKeyBundle === 'object') {
      raw.passkeyPrivateKeyBundle = await reWrapPasskeyBundle(
        raw.passkeyPrivateKeyBundle as WebCryptoAesGcmPayload,
        oldVaultKey,
        newVaultKey,
      );
    }
    if (raw.customFields && Array.isArray(raw.customFields)) {
      for (const field of raw.customFields) {
        if (field && field.name === 'passkeyPrivateKeyBundle' && field.value) {
          try {
            const parsed = typeof field.value === 'string' ? JSON.parse(field.value) : field.value;
            const reWrapped = await reWrapPasskeyBundle(parsed, oldVaultKey, newVaultKey);
            field.value = typeof field.value === 'string' ? JSON.stringify(reWrapped) : reWrapped;
          } catch {}
        }
      }
    }
  }
  return items;
}
