/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { acquireSyncOriginLease, isPrivateOrLoopbackHostname } from '../airgapNetworkPolicy';
import type {
  SyncProvider,
  SyncMetadata,
  SyncRemoteMetadata,
  SyncUploadPreconditions,
} from './syncTypes';
import { SyncError, syncErrorCodes } from './syncTypes';
import {
  MAX_SYNC_PAYLOAD_BYTES,
  readResponseTextBounded,
  validateRemoteSyncMetadata,
} from './syncTypes';

const VAULT_FILE = 'vault.ks';
const METADATA_FILE = 'metadata.json';
const KALDERASHIELD_DIR = 'KalderaShield';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildBasicAuthHeader(username: string, password: string): string {
  const credentialBytes = new TextEncoder().encode(`${username}:${password}`);
  return 'Basic ' + bytesToBase64(credentialBytes);
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith('/') ? url : url + '/';
}

function buildFileUrl(baseUrl: string, filename: string): string {
  return `${ensureTrailingSlash(baseUrl)}${KALDERASHIELD_DIR}/${filename}`;
}

/**
 * WebDAV sync provider.
 *
 * Stores two files in `{baseUrl}/KalderaShield/`:
 *   - `vault.ks`    — Argon2id + AES-256-GCM encrypted vault blob
 *   - `metadata.json`  — lightweight snapshot descriptor (unencrypted JSON)
 *
 * The metadata file is written *after* a successful vault upload so that
 * a partial upload never leaves the remote in an inconsistent state.
 */
export class WebDavSyncProvider implements SyncProvider {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly origin: string;
  /**
   * O-21: releases this provider's hold on the air-gap whitelist. Idempotent, so
   * a double `dispose()` cannot revoke another live provider's exemption.
   */
  private releaseOriginLease: (() => void) | null = null;

  constructor(url: string, username: string, password: string) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new SyncError(syncErrorCodes.connectionFailed, 'WebDAV URL is invalid.');
    }

    if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && isPrivateOrLoopbackHostname(parsedUrl.hostname))) {
      throw new SyncError(
        syncErrorCodes.connectionFailed,
        'WebDAV URL must use HTTPS for security. Loopback and RFC 1918 local network addresses are exempt.',
      );
    }
    this.baseUrl = ensureTrailingSlash(parsedUrl.toString());
    this.authHeader = buildBasicAuthHeader(username, password);
    this.origin = new URL(this.baseUrl).origin;

    // Take a lease rather than a bare whitelist entry, so this origin can
    // actually be revoked when the provider goes away.
    this.releaseOriginLease = acquireSyncOriginLease(this.origin);
  }

  /** Call this when the user removes the WebDAV configuration. */
  dispose(): void {
    this.releaseOriginLease?.();
    this.releaseOriginLease = null;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private defaultHeaders(): HeadersInit {
    return {
      Authorization: this.authHeader,
    };
  }

  private async ensureDirectory(): Promise<void> {
    const dirUrl = `${this.baseUrl}${KALDERASHIELD_DIR}/`;
    const res = await fetch(dirUrl, {
      method: 'MKCOL',
      headers: this.defaultHeaders(),
    });
    // 201 Created or 405 Method Not Allowed (dir already exists) are both fine
    if (!res.ok && res.status !== 405 && res.status !== 301) {
      throw new SyncError(
        syncErrorCodes.connectionFailed,
        `Failed to create KalderaShield directory: HTTP ${res.status}`,
      );
    }
  }

  // ── SyncProvider interface ──────────────────────────────────────────────────

  async testConnection(): Promise<void> {
    let res: Response;
    try {
      res = await fetch(this.baseUrl, {
        method: 'PROPFIND',
        headers: {
          ...this.defaultHeaders(),
          Depth: '0',
        },
      });
    } catch (err) {
      throw new SyncError(syncErrorCodes.connectionFailed, `Cannot reach WebDAV server: ${String(err)}`);
    }

    if (res.status === 401 || res.status === 403) {
      throw new SyncError(syncErrorCodes.authFailed, `WebDAV authentication failed: HTTP ${res.status}`);
    }
    if (!res.ok && res.status !== 207) {
      throw new SyncError(syncErrorCodes.connectionFailed, `WebDAV server returned HTTP ${res.status}`);
    }
  }

  async uploadVault(
    encryptedBlob: string,
    metadata: SyncMetadata,
    preconditions?: SyncUploadPreconditions,
  ): Promise<void> {
    await this.ensureDirectory();

    // 1. Upload the encrypted vault blob
    const vaultUrl = buildFileUrl(this.baseUrl, VAULT_FILE);
    const vaultHeaders = {
      ...this.defaultHeaders(),
      'Content-Type': 'application/octet-stream',
    } as Record<string, string>;
    // Y-11: make the write conditional on the ETag we read. WebDAV servers
    // enforce `If-Match` atomically, so a concurrent write from another device
    // is rejected instead of being clobbered.
    if (preconditions?.ifMatch) {
      vaultHeaders['If-Match'] = preconditions.ifMatch;
    }

    const vaultRes = await fetch(vaultUrl, {
      method: 'PUT',
      headers: vaultHeaders,
      body: encryptedBlob,
    });

    if (vaultRes.status === 412 || vaultRes.status === 409) {
      throw new SyncError(
        syncErrorCodes.remoteModified,
        'Remote vault changed during sync — upload rejected, nothing was overwritten. Run sync again.',
      );
    }
    if (!vaultRes.ok) {
      throw new SyncError(
        syncErrorCodes.uploadFailed,
        `Failed to upload vault: HTTP ${vaultRes.status}`,
      );
    }

    // 2. Upload metadata only after a successful vault upload
    const metaUrl = buildFileUrl(this.baseUrl, METADATA_FILE);
    const metaRes = await fetch(metaUrl, {
      method: 'PUT',
      headers: {
        ...this.defaultHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata, null, 2),
    });

    if (!metaRes.ok) {
      // Y-11: the blob landed but the descriptor did not. The next sync will
      // see 'unreadable' metadata and refuse to overwrite, which is exactly
      // the intended fail-safe — the remote vault is intact, only its label is
      // missing. Surfaced rather than swallowed so the user knows the remote
      // is in that state.
      throw new SyncError(
        syncErrorCodes.uploadFailed,
        `Vault uploaded but metadata write failed: HTTP ${metaRes.status}. ` +
        'The remote vault is intact but unlabelled; the next sync will refuse to overwrite it.',
      );
    }
  }

  async downloadVault(): Promise<string | null> {
    const vaultUrl = buildFileUrl(this.baseUrl, VAULT_FILE);
    let res: Response;
    try {
      res = await fetch(vaultUrl, {
        method: 'GET',
        headers: this.defaultHeaders(),
      });
    } catch (err) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Network error downloading vault: ${String(err)}`);
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Failed to download vault: HTTP ${res.status}`);
    }

    // O-20: a bounded read. The remote controls the body, so it cannot be
    // trusted to stay small.
    return readResponseTextBounded(res, MAX_SYNC_PAYLOAD_BYTES, 'Remote vault snapshot');
  }

  async getRemoteMetadata(): Promise<SyncRemoteMetadata> {
    const metaUrl = buildFileUrl(this.baseUrl, METADATA_FILE);
    let res: Response;
    try {
      res = await fetch(metaUrl, {
        method: 'GET',
        headers: this.defaultHeaders(),
      });
    } catch (err) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Network error fetching metadata: ${String(err)}`);
    }

    // Y-11: 404 means "no remote snapshot yet", which is a legitimate first
    // sync. It is NOT the same as "the file is there but unreadable".
    if (res.status === 404) return { kind: 'absent' };
    if (!res.ok) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Failed to fetch metadata: HTTP ${res.status}`);
    }

    try {
      // O-21: the remote is untrusted, and `updatedAt` steers a destructive
      // decision. An unparsable timestamp must never reach a comparison.
      const validation = validateRemoteSyncMetadata(await res.json());
      if (!validation.ok) {
        return { kind: 'unreadable', detail: `metadata.json failed validation: ${validation.reason}` };
      }
      return { kind: 'ok', metadata: validation.metadata, etag: res.headers?.get?.('etag') ?? undefined };
    } catch (err) {
      // Y-11: the metadata file EXISTS but could not be parsed. The vault
      // blob may be intact and newer than local, so this must be reported as
      // 'unreadable' — reporting it as absent is what caused the overwrite.
      return {
        kind: 'unreadable',
        detail: `metadata.json is present but not parsable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getVaultETag(): Promise<string | null> {
    const vaultUrl = buildFileUrl(this.baseUrl, VAULT_FILE);
    let res: Response;
    try {
      res = await fetch(vaultUrl, { method: 'HEAD', headers: this.defaultHeaders() });
    } catch {
      return null;
    }
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return res.headers?.get?.('etag') ?? null;
  }
}
