/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ─── Core Sync Types ────────────────────────────────────────────────────────

export type SyncProviderType = 'webdav' | 's3' | 'disabled';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error' | 'conflict';

export interface SyncMetadata {
  /** ISO-8601 UTC timestamp of the last successful upload */
  updatedAt: string;
  /** Unique device identifier (random UUID, generated once and stored locally) */
  deviceId: string;
  /** Vault schema version, e.g. "7.0" */
  vaultVersion: string;
  /** SHA-256 hex of the encrypted vault blob, for integrity verification */
  checksum: string;
  /** Total number of items in this snapshot */
  itemCount: number;
}

/**
 * Y-11: what is actually on the remote, as opposed to "we managed to read the
 * metadata file".
 *
 * The previous contract returned `SyncMetadata | null`, and `null` meant both
 * "there is no remote yet" AND "the metadata file exists but could not be
 * parsed". `performSync` treated both as "remote absent" and then uploaded the
 * local vault unconditionally — destroying an intact remote backup whose
 * metadata write had merely failed, and reporting `status: 'success'`.
 *
 * A sync provider that cannot establish what is on the remote must say so.
 */
export type SyncRemoteMetadata =
  /** Genuinely no remote snapshot yet (HTTP 404). First sync. */
  | { kind: 'absent' }
  /**
   * A remote file exists but its metadata could not be read or parsed.
   *
   * This is the dangerous case: the vault blob may be perfectly intact and
   * newer than local. Callers MUST NOT upload over it.
   */
  | { kind: 'unreadable'; detail: string }
  /** Metadata read successfully. `etag` is the provider's version token, if any. */
  | { kind: 'ok'; metadata: SyncMetadata; etag?: string };

/** Preconditions for an upload, so a concurrent write is detected rather than clobbered. */
export interface SyncUploadPreconditions {
  /**
   * ETag observed when the remote state was last read. The provider must make
   * the write conditional on it being unchanged.
   */
  ifMatch?: string;
}

/**
 * O-20: largest remote sync payload accepted into memory.
 *
 * Every other untrusted input path in this codebase is bounded
 * (`MAX_BACKUP_FILE_SIZE` 100 MB, `MAX_ANDROID_PAYLOAD_BYTES` 25 MB,
 * `MAX_ATTACHMENT_SIZE`), and the remote sync blob was the single exception —
 * `res.text()` read whatever the server sent. A hostile or compromised remote
 * (or a loopback-SSRF'd endpoint) could therefore force a multi-hundred-megabyte
 * allocation and take the WebView down with it.
 *
 * A sync snapshot is an encrypted JSON envelope of the user's own vault. 32 MB
 * is far above any realistic size and well below what would destabilise a mobile
 * renderer.
 */
export const MAX_SYNC_PAYLOAD_BYTES = 32 * 1024 * 1024;

/**
 * O-21: validates a remote `metadata.json`.
 *
 * The remote is not trusted, and every field here steers a destructive
 * decision. The concrete failure this closes: an `updatedAt` that does not parse
 * becomes `NaN`, and `NaN > anything` is `false`, so `performSync` concluded the
 * remote was *not* newer, skipped the download, and uploaded the local vault
 * over it. A ~60-byte `metadata.json` was therefore enough to trigger a
 * destructive overwrite of a healthy remote backup.
 *
 * `itemCount` is also checked for shape even though nothing compares it yet, so a
 * future comparison cannot be fed a string.
 *
 * @returns the validated metadata, or a human-readable reason it is unusable.
 */
export function validateRemoteSyncMetadata(
  value: unknown,
): { ok: true; metadata: SyncMetadata } | { ok: false; reason: string } {
  if (typeof value !== 'object' || value === null) {
    return { ok: false, reason: 'metadata is not an object' };
  }
  const candidate = value as Partial<SyncMetadata>;

  if (typeof candidate.updatedAt !== 'string' || candidate.updatedAt.length === 0) {
    return { ok: false, reason: 'updatedAt must be a non-empty string' };
  }
  // The decisive check: an unparsable timestamp must never reach a comparison.
  if (!Number.isFinite(new Date(candidate.updatedAt).getTime())) {
    return { ok: false, reason: `updatedAt is not a valid timestamp: ${candidate.updatedAt}` };
  }

  if (typeof candidate.deviceId !== 'string' || candidate.deviceId.length === 0) {
    return { ok: false, reason: 'deviceId must be a non-empty string' };
  }

  if (typeof candidate.vaultVersion !== 'string' || candidate.vaultVersion.length === 0) {
    return { ok: false, reason: 'vaultVersion must be a non-empty string' };
  }

  // The checksum drives integrity verification of the downloaded blob.
  if (typeof candidate.checksum !== 'string' || !/^[0-9a-f]{64}$/i.test(candidate.checksum)) {
    return { ok: false, reason: 'checksum must be a 64-character hex string' };
  }

  if (
    typeof candidate.itemCount !== 'number'
    || !Number.isInteger(candidate.itemCount)
    || candidate.itemCount < 0
  ) {
    return { ok: false, reason: 'itemCount must be a non-negative integer' };
  }

  return {
    ok: true,
    metadata: {
      updatedAt: candidate.updatedAt,
      deviceId: candidate.deviceId,
      vaultVersion: candidate.vaultVersion,
      checksum: candidate.checksum.toLowerCase(),
      itemCount: candidate.itemCount,
    },
  };
}

/**
 * O-20: reads a response body into text, refusing anything over `maxBytes`.
 *
 * A `Content-Length` pre-check rejects an obviously-oversized body cheaply, and
 * the stream is bounded independently so a response that lies about (or omits)
 * its length still cannot exhaust memory. A length-only check is a TOCTOU hole:
 * the header is attacker-controlled.
 *
 * Works without `Response.body` (jsdom, older runtimes) by falling back to a
 * post-read length check, which is still better than no bound at all.
 */
export async function readResponseTextBounded(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<string> {
  const declared = Number(response.headers?.get?.('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new SyncError(
      syncErrorCodes.remoteTooLarge,
      `${label} declares ${declared} bytes, above the ${maxBytes}-byte limit.`,
    );
  }

  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    // No streaming available: read once, then verify. Cannot stop mid-flight, but
    // the declared-length check above still covers the honest case.
    const text = await response.text();
    if (text.length > maxBytes) {
      throw new SyncError(syncErrorCodes.remoteTooLarge, `${label} exceeds the ${maxBytes}-byte limit.`);
    }
    return text;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        // Stop pulling immediately; do not wait for the rest of the body.
        await reader.cancel().catch(() => undefined);
        throw new SyncError(
          syncErrorCodes.remoteTooLarge,
          `${label} exceeds the ${maxBytes}-byte limit.`,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

/** Configuration for a WebDAV sync provider */
export interface WebDavSyncConfig {
  type: 'webdav';
  /** Full base URL including trailing slash, e.g. https://nc.example.com/remote.php/dav/files/user/ */
  url: string;
  /** WebDAV username */
  username: string;
  /**
   * WebDAV password or app-token.
   * Stored encrypted — never held in memory after use.
   */
  password: string;
}

/** Configuration for an S3-compatible sync provider (AWS S3, MinIO, Cloudflare R2) */
export interface S3SyncConfig {
  type: 's3';
  /** Base URL / endpoint, e.g. https://s3.us-east-1.amazonaws.com or https://minio.example.com */
  endpoint: string;
  /** S3 region, e.g. us-east-1, auto, eu-central-1 */
  region: string;
  /** Bucket name */
  bucket: string;
  /** Access key ID */
  accessKeyId: string;
  /** Secret access key — stored encrypted */
  secretAccessKey: string;
  /** Optional custom path prefix inside bucket, e.g. "kalderashield-backup" */
  prefix?: string;
}

export type SyncConfig = WebDavSyncConfig | S3SyncConfig | { type: 'disabled' };

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface SyncProvider {
  /**
   * Upload the encrypted vault blob to the remote store.
   *
   * Y-11: `preconditions.ifMatch` must make the write conditional. When the
   * provider can enforce it, a concurrent modification must surface as
   * `syncErrorCodes.remoteModified` rather than silently overwriting.
   */
  uploadVault(
    encryptedBlob: string,
    metadata: SyncMetadata,
    preconditions?: SyncUploadPreconditions,
  ): Promise<void>;

  /**
   * Download the remote encrypted vault blob.
   * Returns null when no remote file exists yet (first sync).
   */
  downloadVault(): Promise<string | null>;

  /**
   * Report what is on the remote.
   *
   * Y-11: must distinguish "absent" from "present but unreadable". Returning
   * `null` for both is what allowed an unreadable remote to be overwritten.
   */
  getRemoteMetadata(): Promise<SyncRemoteMetadata>;

  /**
   * Y-11: the ETag/version token for the vault blob as of the last read, when
   * the provider can supply one. Optional: a provider without server-side
   * conditional writes still benefits from parts (a) and (c) of the fix.
   */
  getVaultETag?(): Promise<string | null>;

  /**
   * Verify provider connectivity and credentials.
   * Resolves normally on success, rejects with a SyncError otherwise.
   */
  testConnection(): Promise<void>;

  /** Clean up resources and unregister network policy whitelist origins if applicable */
  dispose?: () => void;
}

// ─── Result / Error Types ────────────────────────────────────────────────────

export const syncErrorCodes = {
  connectionFailed: 'sync.connectionFailed',
  authFailed: 'sync.authFailed',
  uploadFailed: 'sync.uploadFailed',
  downloadFailed: 'sync.downloadFailed',
  checksumMismatch: 'sync.checksumMismatch',
  invalidEnvelope: 'sync.invalidEnvelope',
  noProvider: 'sync.noProvider',
  masterPasswordRequired: 'sync.masterPasswordRequired',
  /**
   * Y-11: the remote snapshot exists but its metadata could not be read, so it
   * is unknown whether the local vault is newer. Uploading would destroy a
   * possibly-intact off-device backup, so sync refuses instead.
   */
  remoteStateUnknown: 'sync.remoteStateUnknown',
  /**
   * Y-11: the remote changed between the read and the write. The upload was
   * rejected by the precondition, so nothing was overwritten.
   */
  remoteModified: 'sync.remoteModified',
  /** O-20: a remote payload exceeded `MAX_SYNC_PAYLOAD_BYTES`. */
  remoteTooLarge: 'sync.remoteTooLarge',
  /**
   * O-21: a remote `metadata.json` failed schema validation. Handled exactly
   * like unreadable metadata: refuse to write over an unverified remote.
   */
  remoteMetadataInvalid: 'sync.remoteMetadataInvalid',
} as const;

export type SyncErrorCode = (typeof syncErrorCodes)[keyof typeof syncErrorCodes];

export class SyncError extends Error {
  constructor(
    public readonly code: SyncErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'SyncError';
  }
}

export interface SyncConflictItem {
  id: string;
  title: string;
  localUpdatedAt: string;
  remoteUpdatedAt: string;
}

export interface SyncResult {
  status: 'success' | 'conflict' | 'error' | 'no_provider';
  /** ISO-8601 UTC timestamp */
  syncedAt?: string;
  /** Items merged from remote that were newer than local version */
  mergedCount?: number;
  /** Items that could not be auto-resolved */
  conflicts?: SyncConflictItem[];
  error?: SyncError;
  /**
   * Y-11: the ETag of the remote vault this client successfully uploaded.
   * Recorded so the next sync can tell "still my snapshot" from "someone else
   * replaced it".
   */
  uploadedETag?: string;
}
