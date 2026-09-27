/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O-4 — WebAuthn assertion verification.
 *
 * ## The finding
 *
 * `authenticateAndIncrementPasskey` used to call `navigator.credentials.get()`,
 * check that the returned `credentialId` matched the record, and then report
 * success. The signature, the client data, and the RP ID hash were never
 * examined. The stored `publicKey` was captured at registration and then never
 * used for anything.
 *
 * That makes the passkey "authenticate" action a **false security claim**: the
 * UI reports a successful cryptographic authentication, and the vault records a
 * `signCount` increment and a `lastUsedAt` timestamp, while no signature was
 * ever checked. Anything the platform is willing to return for that credential
 * id would be accepted.
 *
 * ## What is verified here
 *
 * The checks below are the WebAuthn Level 3 relying-party steps that are
 * meaningful in a browser:
 *
 *  - `clientDataJSON.type` is `webauthn.get`
 *  - `clientDataJSON.challenge` equals the challenge **this call** issued
 *  - `clientDataJSON.origin` is the expected origin, and cross-origin is refused
 *  - `authenticatorData.rpIdHash` equals SHA-256 of the expected RP ID
 *  - the User Present flag is set
 *  - the signature verifies over `authenticatorData || SHA-256(clientDataJSON)`
 *    with the stored public key
 *  - the new sign counter does not go backwards (clone signal)
 *
 * The one thing deliberately NOT claimed is attestation trust: registration uses
 * `attestation: 'none'`, so there is no attestation statement to chain to a
 * root. This verifies *the assertion came from the holder of the private key
 * for this credential*, which is what a relying party actually needs.
 */

const COSE_ALG_ES256 = -7;
const COSE_ALG_EDDSA = -8;
const COSE_ALG_RS256 = -257;

/** Flags byte offsets inside authenticator data (WebAuthn §6.1). */
const AUTH_DATA_MIN_LENGTH = 37;
const AUTH_DATA_RP_ID_HASH_END = 32;
const AUTH_DATA_FLAGS_OFFSET = 32;
const AUTH_DATA_SIGN_COUNT_OFFSET = 33;
const AUTH_DATA_USER_FLAG = 0x01;

export type PasskeyVerificationFailure =
  | 'missing-material'
  | 'client-data-unparsable'
  | 'wrong-ceremony-type'
  | 'challenge-mismatch'
  | 'origin-mismatch'
  | 'cross-origin'
  | 'authenticator-data-truncated'
  | 'rp-id-mismatch'
  | 'user-not-present'
  | 'unsupported-algorithm'
  | 'bad-signature-encoding'
  | 'signature-invalid'
  | 'user-handle-mismatch'
  | 'sign-count-regressed';

export interface PasskeyVerificationInput {
  /** SPKI DER public key, base64url, exactly as stored at registration. */
  publicKeyBase64Url: string;
  /** The RP ID the credential was registered against. */
  rpId: string;
  /** The challenge this verification call issued, raw bytes. */
  expectedChallenge: Uint8Array;
  /** Origin the assertion must claim (e.g. `https://app.example`). */
  expectedOrigin: string;
  algorithm: 'ES256' | 'EdDSA' | 'RS256';
  authenticatorData: Uint8Array;
  clientDataJson: Uint8Array;
  signature: Uint8Array;
  /** Sign counter recorded before this assertion, if any. */
  previousSignCount?: number;
  /** User handle returned by the authenticator, base64url, if any. */
  userHandleBase64Url?: string;
  /** User handle recorded at registration, if any. */
  expectedUserHandleBase64Url?: string;
}

export type PasskeyVerificationResult =
  | { verified: true; signCount: number }
  | { verified: false; reason: PasskeyVerificationFailure };

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function base64UrlToBytes(value: string): Uint8Array {
  const normalised = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  return new Uint8Array(digest);
}

/**
 * WebAuthn ES256 signatures are ASN.1 DER `SEQUENCE { r INTEGER, s INTEGER }`,
 * but WebCrypto's ECDSA `verify` expects the raw fixed-width `r || s` form.
 * This is the single most common reason a correct WebAuthn verification fails.
 */
export function derEcdsaToRaw(signature: Uint8Array, coordinateLength = 32): Uint8Array | null {
  // SEQUENCE
  if (signature[0] !== 0x30) return null;
  let offset = 1;
  const sequenceLengthByte = signature[offset];
  if (sequenceLengthByte === undefined) return null;
  let sequenceLength: number;
  if (sequenceLengthByte & 0x80) {
    const lengthBytes = sequenceLengthByte & 0x7f;
    if (lengthBytes === 0 || lengthBytes > 2 || offset + 1 + lengthBytes > signature.length) return null;
    sequenceLength = 0;
    for (let i = 0; i < lengthBytes; i += 1) {
      sequenceLength = (sequenceLength << 8) | signature[offset + 1 + i]!;
    }
    offset += 1 + lengthBytes;
  } else {
    sequenceLength = sequenceLengthByte;
    // The length byte itself occupies one slot, so the first INTEGER tag sits
    // after it. Forgetting this makes every short-form sequence unparsable.
    offset += 1;
  }
  if (offset + sequenceLength > signature.length) return null;

  const readInteger = (start: number): { value: Uint8Array; next: number } | null => {
    if (signature[start] !== 0x02) return null;
    const lengthByte = signature[start + 1];
    if (lengthByte === undefined) return null;
    // Strip a single leading zero pad, which DER requires for positive values
    // whose high bit is set.
    let valueStart = start + 2;
    let valueLength = lengthByte;
    if (valueLength > 0 && signature[valueStart] === 0x00) {
      valueStart += 1;
      valueLength -= 1;
    }
    if (valueStart + valueLength > signature.length) return null;
    return {
      value: signature.subarray(valueStart, valueStart + valueLength),
      next: start + 2 + lengthByte,
    };
  };

  const r = readInteger(offset);
  if (!r) return null;
  const s = readInteger(r.next);
  if (!s) return null;

  const raw = new Uint8Array(coordinateLength * 2);
  // Each coordinate is right-aligned inside its OWN fixed-width slot, not
  // inside the whole buffer: `r` occupies [0, coordinateLength) and `s`
  // occupies [coordinateLength, 2 * coordinateLength).
  const writeRightAligned = (source: Uint8Array, target: Uint8Array, targetOffset: number): boolean => {
    if (source.length > coordinateLength) return false;
    target.set(source, targetOffset + (coordinateLength - source.length));
    return true;
  };
  if (!writeRightAligned(r.value, raw, 0)) return null;
  if (!writeRightAligned(s.value, raw, coordinateLength)) return null;
  return raw;
}

async function importVerificationKey(
  spki: Uint8Array,
  algorithm: PasskeyVerificationInput['algorithm'],
): Promise<CryptoKey | null> {
  // Ed25519 is not universally available; a missing algorithm must be reported
  // as "cannot verify", never as "verified".
  if (algorithm === 'EdDSA') {
    try {
      return await crypto.subtle.importKey('spki', spki as unknown as BufferSource, { name: 'Ed25519' }, false, ['verify']);
    } catch {
      return null;
    }
  }
  return crypto.subtle.importKey(
    'spki',
    spki as unknown as BufferSource,
    algorithm === 'ES256'
      ? { name: 'ECDSA', namedCurve: 'P-256' }
      : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

async function verifySignature(
  key: CryptoKey,
  algorithm: PasskeyVerificationInput['algorithm'],
  signedData: Uint8Array,
  signature: Uint8Array,
): Promise<boolean> {
  if (algorithm === 'ES256') {
    const raw = derEcdsaToRaw(signature);
    if (!raw) return false;
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      raw as unknown as BufferSource,
      signedData as unknown as BufferSource,
    );
  }
  if (algorithm === 'EdDSA') {
    return crypto.subtle.verify(
      { name: 'Ed25519' },
      key,
      signature as unknown as BufferSource,
      signedData as unknown as BufferSource,
    );
  }
  return crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    signature as unknown as BufferSource,
    signedData as unknown as BufferSource,
  );
}

/**
 * Full assertion verification. Never throws for an untrusted assertion — it
 * returns `{ verified: false, reason }` so the caller decides how to surface it.
 */
export async function verifyPasskeyAssertion(
  input: PasskeyVerificationInput,
): Promise<PasskeyVerificationResult> {
  if (!input.publicKeyBase64Url || input.authenticatorData.length === 0
    || input.clientDataJson.length === 0 || input.signature.length === 0) {
    return { verified: false, reason: 'missing-material' };
  }

  // --- clientDataJSON ------------------------------------------------------
  let clientData: { type?: unknown; challenge?: unknown; origin?: unknown; crossOrigin?: unknown };
  try {
    clientData = JSON.parse(new TextDecoder().decode(input.clientDataJson)) as typeof clientData;
  } catch {
    return { verified: false, reason: 'client-data-unparsable' };
  }

  if (clientData.type !== 'webauthn.get') {
    return { verified: false, reason: 'wrong-ceremony-type' };
  }
  if (clientData.crossOrigin === true) {
    return { verified: false, reason: 'cross-origin' };
  }
  if (typeof clientData.challenge !== 'string'
    || !constantTimeEqual(base64UrlToBytes(clientData.challenge), input.expectedChallenge)) {
    return { verified: false, reason: 'challenge-mismatch' };
  }
  if (clientData.origin !== input.expectedOrigin) {
    return { verified: false, reason: 'origin-mismatch' };
  }

  // --- authenticatorData ---------------------------------------------------
  if (input.authenticatorData.length < AUTH_DATA_MIN_LENGTH) {
    return { verified: false, reason: 'authenticator-data-truncated' };
  }
  const expectedRpIdHash = await sha256(new TextEncoder().encode(input.rpId));
  if (!constantTimeEqual(
    input.authenticatorData.subarray(0, AUTH_DATA_RP_ID_HASH_END),
    expectedRpIdHash,
  )) {
    return { verified: false, reason: 'rp-id-mismatch' };
  }
  const flags = input.authenticatorData[AUTH_DATA_FLAGS_OFFSET]!;
  if ((flags & AUTH_DATA_USER_FLAG) === 0) {
    return { verified: false, reason: 'user-not-present' };
  }

  const signCount = new DataView(
    input.authenticatorData.buffer,
    input.authenticatorData.byteOffset + AUTH_DATA_SIGN_COUNT_OFFSET,
    4,
  ).getUint32(0, false);

  // --- user handle ---------------------------------------------------------
  if (input.expectedUserHandleBase64Url && input.userHandleBase64Url
    && input.userHandleBase64Url !== input.expectedUserHandleBase64Url) {
    return { verified: false, reason: 'user-handle-mismatch' };
  }

  // --- signature -----------------------------------------------------------
  let key: CryptoKey;
  try {
    const spki = base64UrlToBytes(input.publicKeyBase64Url);
    const imported = await importVerificationKey(spki, input.algorithm);
    if (!imported) return { verified: false, reason: 'unsupported-algorithm' };
    key = imported;
  } catch {
    return { verified: false, reason: 'unsupported-algorithm' };
  }

  const clientDataHash = await sha256(input.clientDataJson);
  const signedData = new Uint8Array(input.authenticatorData.length + clientDataHash.length);
  signedData.set(input.authenticatorData, 0);
  signedData.set(clientDataHash, input.authenticatorData.length);

  let signatureValid = false;
  try {
    signatureValid = await verifySignature(key, input.algorithm, signedData, input.signature);
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) {
    return { verified: false, reason: input.algorithm === 'ES256' && derEcdsaToRaw(input.signature) === null
      ? 'bad-signature-encoding'
      : 'signature-invalid' };
  }

  // --- clone signal --------------------------------------------------------
  // Both counters being non-zero and the new one not being strictly greater is
  // the WebAuthn clone-detection condition.
  const previous = input.previousSignCount ?? 0;
  if (previous > 0 && signCount > 0 && signCount <= previous) {
    return { verified: false, reason: 'sign-count-regressed' };
  }

  return { verified: true, signCount };
}

/** Maps a COSE algorithm id to the passkey algorithm label, for logging. */
export function describeCoseAlgorithm(coseAlg: number | undefined): string {
  switch (coseAlg) {
    case COSE_ALG_ES256: return 'ES256';
    case COSE_ALG_EDDSA: return 'EdDSA';
    case COSE_ALG_RS256: return 'RS256';
    default: return 'unknown';
  }
}
