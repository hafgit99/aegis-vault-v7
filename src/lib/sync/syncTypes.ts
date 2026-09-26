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
  /** Optional custom path prefix inside bucket, e.g. "aegis-backup" */
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
