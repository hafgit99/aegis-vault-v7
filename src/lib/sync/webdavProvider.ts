/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { addSyncAllowedOrigin, isPrivateOrLoopbackHostname, removeSyncAllowedOrigin } from '../airgapNetworkPolicy';
import { SyncProvider, SyncMetadata, SyncError, syncErrorCodes } from './syncTypes';

const VAULT_FILE = 'vault.aegis';
const METADATA_FILE = 'metadata.json';
const AEGIS_DIR = 'AegisVault';

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
  return `${ensureTrailingSlash(baseUrl)}${AEGIS_DIR}/${filename}`;
}

/**
 * WebDAV sync provider.
 *
 * Stores two files in `{baseUrl}/AegisVault/`:
 *   - `vault.aegis`    — Argon2id + AES-256-GCM encrypted vault blob
 *   - `metadata.json`  — lightweight snapshot descriptor (unencrypted JSON)
 *
 * The metadata file is written *after* a successful vault upload so that
 * a partial upload never leaves the remote in an inconsistent state.
 */
export class WebDavSyncProvider implements SyncProvider {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly origin: string;

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

    // Register this origin in the air-gap whitelist so our fetch calls are allowed
    addSyncAllowedOrigin(this.origin);
  }

  /** Call this when the user removes the WebDAV configuration. */
  dispose(): void {
    removeSyncAllowedOrigin(this.origin);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private defaultHeaders(): HeadersInit {
    return {
      Authorization: this.authHeader,
    };
  }

  private async ensureDirectory(): Promise<void> {
    const dirUrl = `${this.baseUrl}${AEGIS_DIR}/`;
    const res = await fetch(dirUrl, {
      method: 'MKCOL',
      headers: this.defaultHeaders(),
    });
    // 201 Created or 405 Method Not Allowed (dir already exists) are both fine
    if (!res.ok && res.status !== 405 && res.status !== 301) {
      throw new SyncError(
        syncErrorCodes.connectionFailed,
        `Failed to create AegisVault directory: HTTP ${res.status}`,
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

  async uploadVault(encryptedBlob: string, metadata: SyncMetadata): Promise<void> {
    await this.ensureDirectory();

    // 1. Upload the encrypted vault blob
    const vaultUrl = buildFileUrl(this.baseUrl, VAULT_FILE);
    const vaultRes = await fetch(vaultUrl, {
      method: 'PUT',
      headers: {
        ...this.defaultHeaders(),
        'Content-Type': 'application/octet-stream',
      },
      body: encryptedBlob,
    });

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
      throw new SyncError(
        syncErrorCodes.uploadFailed,
        `Vault uploaded but metadata write failed: HTTP ${metaRes.status}`,
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

    return res.text();
  }

  async getRemoteMetadata(): Promise<SyncMetadata | null> {
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

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Failed to fetch metadata: HTTP ${res.status}`);
    }

    try {
      return (await res.json()) as SyncMetadata;
    } catch {
      // Corrupt metadata — treat as no remote
      return null;
    }
  }
}
