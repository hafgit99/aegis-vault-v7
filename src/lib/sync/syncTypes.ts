/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ─── Core Sync Types ────────────────────────────────────────────────────────

export type SyncProviderType = 'webdav' | 'disabled';

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

export type SyncConfig = WebDavSyncConfig | { type: 'disabled' };

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface SyncProvider {
  /**
   * Upload the encrypted vault blob to the remote store.
   * @param encryptedBlob — stringified Aegis secure backup envelope
   * @param metadata — machine-readable snapshot descriptor
   */
  uploadVault(encryptedBlob: string, metadata: SyncMetadata): Promise<void>;

  /**
   * Download the remote encrypted vault blob.
   * Returns null when no remote file exists yet (first sync).
   */
  downloadVault(): Promise<string | null>;

  /**
   * Fetch only the remote metadata JSON (lightweight, avoids full blob download).
   * Returns null when no metadata file exists yet.
   */
  getRemoteMetadata(): Promise<SyncMetadata | null>;

  /**
   * Verify provider connectivity and credentials.
   * Resolves normally on success, rejects with a SyncError otherwise.
   */
  testConnection(): Promise<void>;
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
}
