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
  S3SyncConfig,
} from './syncTypes';
import { SyncError, syncErrorCodes } from './syncTypes';
import {
  MAX_SYNC_PAYLOAD_BYTES,
  readResponseTextBounded,
  validateRemoteSyncMetadata,
} from './syncTypes';

const VAULT_FILE = 'vault.aegis';
const METADATA_FILE = 'metadata.json';
const DEFAULT_AEGIS_DIR = 'AegisVault';

// ─── WebCrypto SigV4 Helpers ──────────────────────────────────────────────────

async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSha256(key: Uint8Array, data: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
  return new Uint8Array(signature);
}

async function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  regionName: string,
  serviceName: string = 's3',
): Promise<Uint8Array> {
  const kSecret = new TextEncoder().encode('AWS4' + secretKey);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  return kSigning;
}

function getAmzTimestamps(now = new Date()): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
  const amzDate = iso;
  const dateStamp = iso.substring(0, 8);
  return { amzDate, dateStamp };
}

// ─── S3 Provider Class ────────────────────────────────────────────────────────

export class S3SyncProvider implements SyncProvider {
  private readonly endpoint: string;
  private readonly region: string;
  private readonly bucket: string;
  private readonly accessKeyId: string;
  private readonly secretAccessKey: string;
  private readonly prefix: string;
  private readonly origin: string;
  /**
   * O-21: releases this provider's hold on the air-gap whitelist. Idempotent, so
   * a double `dispose()` cannot revoke another live provider's exemption.
   */
  private releaseOriginLease: (() => void) | null = null;

  constructor(config: S3SyncConfig) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(config.endpoint);
    } catch {
      throw new SyncError(syncErrorCodes.connectionFailed, 'S3 Endpoint URL is invalid.');
    }

    if (parsedUrl.protocol !== 'https:' && !(parsedUrl.protocol === 'http:' && isPrivateOrLoopbackHostname(parsedUrl.hostname))) {
      throw new SyncError(
        syncErrorCodes.connectionFailed,
        'S3 Endpoint URL must use HTTPS for security. Loopback and RFC 1918 local network addresses are exempt.',
      );
    }

    this.endpoint = parsedUrl.origin + parsedUrl.pathname.replace(/\/$/, '');
    this.region = config.region.trim() || 'us-east-1';
    this.bucket = config.bucket.trim();
    this.accessKeyId = config.accessKeyId.trim();
    this.secretAccessKey = config.secretAccessKey.trim();
    this.prefix = (config.prefix?.trim() || DEFAULT_AEGIS_DIR).replace(/^\//, '').replace(/\/$/, '');
    this.origin = parsedUrl.origin;

    // O-21: take a lease rather than a bare whitelist entry, so this origin can
    // actually be revoked when the provider goes away.
    this.releaseOriginLease = acquireSyncOriginLease(this.origin);
  }

  dispose(): void {
    this.releaseOriginLease?.();
    this.releaseOriginLease = null;
  }

  private buildKeyPath(filename: string): string {
    return this.prefix ? `${this.prefix}/${filename}` : filename;
  }

  private buildObjectUrl(keyPath: string): string {
    const cleanEndpoint = this.endpoint.replace(/\/$/, '');
    // Check if bucket is already in endpoint hostname (virtual-host style)
    const urlObj = new URL(cleanEndpoint);
    if (urlObj.hostname.startsWith(`${this.bucket}.`)) {
      return `${cleanEndpoint}/${keyPath}`;
    }
    // Path-style URL format: https://endpoint/bucket/keyPath
    return `${cleanEndpoint}/${this.bucket}/${keyPath}`;
  }

  private async createSignedHeaders(
    method: string,
    url: string,
    body: string | Uint8Array = '',
    extraHeaders: Record<string, string> = {},
  ): Promise<Record<string, string>> {
    const targetUrl = new URL(url);
    const { amzDate, dateStamp } = getAmzTimestamps();
    const payloadHash = await sha256Hex(body);

    const headers: Record<string, string> = {
      host: targetUrl.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      ...extraHeaders,
    };

    const sortedHeaderNames = Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort();
    const signedHeadersStr = sortedHeaderNames.join(';');

    const canonicalHeadersStr = sortedHeaderNames
      .map((h) => {
        const val = headers[h];
        return val !== undefined ? `${h}:${val.trim()}\n` : '';
      })
      .join('');

    const canonicalRequest = [
      method.toUpperCase(),
      encodeURI(targetUrl.pathname),
      targetUrl.search.substring(1), // canonical query string
      canonicalHeadersStr,
      signedHeadersStr,
      payloadHash,
    ].join('\n');

    const canonicalRequestHash = await sha256Hex(canonicalRequest);
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;

    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    const signingKey = await getSignatureKey(this.secretAccessKey, dateStamp, this.region, 's3');
    const signatureBytes = await hmacSha256(signingKey, stringToSign);
    const signatureHex = Array.from(signatureBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signatureHex}`;

    return {
      ...headers,
      Authorization: authorizationHeader,
    };
  }

  // ── SyncProvider Interface ──────────────────────────────────────────────────

  async testConnection(): Promise<void> {
    const testUrl = this.buildObjectUrl(this.buildKeyPath(METADATA_FILE));
    let headers: Record<string, string>;
    try {
      headers = await this.createSignedHeaders('HEAD', testUrl);
    } catch (err) {
      throw new SyncError(syncErrorCodes.connectionFailed, `Failed to build AWS SigV4 request: ${String(err)}`);
    }

    let res: Response;
    try {
      res = await fetch(testUrl, { method: 'HEAD', headers });
    } catch (err) {
      throw new SyncError(syncErrorCodes.connectionFailed, `Cannot reach S3 endpoint: ${String(err)}`);
    }

    if (res.status === 403 || res.status === 401) {
      throw new SyncError(syncErrorCodes.authFailed, `S3 authentication failed: HTTP ${res.status}`);
    }
    // 404 is fine (bucket exists and credentials work, file simply does not exist yet)
    if (!res.ok && res.status !== 404) {
      throw new SyncError(syncErrorCodes.connectionFailed, `S3 server returned HTTP ${res.status}`);
    }
  }

  async uploadVault(
    encryptedBlob: string,
    metadata: SyncMetadata,
    preconditions?: SyncUploadPreconditions,
  ): Promise<void> {
    // 1. Upload vault blob
    const vaultPath = this.buildKeyPath(VAULT_FILE);
    const vaultUrl = this.buildObjectUrl(vaultPath);
    const extraVaultHeaders: Record<string, string> = {
      'content-type': 'application/octet-stream',
    };
    // Y-11: the ETag must be part of the signed request so the server can
    // enforce it. S3-compatible stores support `If-Match` on PutObject, but not
    // every compatible implementation does, so the caller-visible behaviour is
    // covered by the "unreadable remote" refusal as well — the two mechanisms
    // fail safe independently.
    if (preconditions?.ifMatch) {
      extraVaultHeaders['if-match'] = preconditions.ifMatch;
    }
    const vaultHeaders = await this.createSignedHeaders('PUT', vaultUrl, encryptedBlob, extraVaultHeaders);

    let vaultRes: Response;
    try {
      vaultRes = await fetch(vaultUrl, {
        method: 'PUT',
        headers: vaultHeaders,
        body: encryptedBlob,
      });
    } catch (err) {
      throw new SyncError(syncErrorCodes.uploadFailed, `Network error uploading vault to S3: ${String(err)}`);
    }

    if (vaultRes.status === 412 || vaultRes.status === 409) {
      throw new SyncError(
        syncErrorCodes.remoteModified,
        'Remote vault changed during sync — upload rejected, nothing was overwritten. Run sync again.',
      );
    }
    if (!vaultRes.ok) {
      throw new SyncError(syncErrorCodes.uploadFailed, `Failed to upload vault to S3: HTTP ${vaultRes.status}`);
    }

    // 2. Upload metadata after successful vault upload
    const metaPath = this.buildKeyPath(METADATA_FILE);
    const metaUrl = this.buildObjectUrl(metaPath);
    const metaBody = JSON.stringify(metadata, null, 2);
    const metaHeaders = await this.createSignedHeaders('PUT', metaUrl, metaBody, {
      'content-type': 'application/json',
    });

    let metaRes: Response;
    try {
      metaRes = await fetch(metaUrl, {
        method: 'PUT',
        headers: metaHeaders,
        body: metaBody,
      });
    } catch (err) {
      throw new SyncError(syncErrorCodes.uploadFailed, `Network error uploading metadata to S3: ${String(err)}`);
    }

    if (!metaRes.ok) {
      // Y-11: see the WebDAV provider — the blob landed but its descriptor did
      // not, and the next sync will refuse to overwrite because of it.
      throw new SyncError(
        syncErrorCodes.uploadFailed,
        `Vault uploaded but metadata write failed on S3: HTTP ${metaRes.status}. ` +
        'The remote vault is intact but unlabelled; the next sync will refuse to overwrite it.',
      );
    }
  }

  async downloadVault(): Promise<string | null> {
    const vaultPath = this.buildKeyPath(VAULT_FILE);
    const vaultUrl = this.buildObjectUrl(vaultPath);
    const headers = await this.createSignedHeaders('GET', vaultUrl);

    let res: Response;
    try {
      res = await fetch(vaultUrl, { method: 'GET', headers });
    } catch (err) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Network error downloading vault from S3: ${String(err)}`);
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Failed to download vault from S3: HTTP ${res.status}`);
    }

    // O-20: a bounded read. The remote controls the body, so it cannot be
    // trusted to stay small.
    return readResponseTextBounded(res, MAX_SYNC_PAYLOAD_BYTES, 'Remote vault snapshot');
  }

  async getRemoteMetadata(): Promise<SyncRemoteMetadata> {
    const metaPath = this.buildKeyPath(METADATA_FILE);
    const metaUrl = this.buildObjectUrl(metaPath);
    const headers = await this.createSignedHeaders('GET', metaUrl);

    let res: Response;
    try {
      res = await fetch(metaUrl, { method: 'GET', headers });
    } catch (err) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Network error fetching metadata from S3: ${String(err)}`);
    }

    // Y-11: 404 is a genuine "no remote snapshot yet". Anything else that
    // fails to parse is 'unreadable', never 'absent'.
    if (res.status === 404) return { kind: 'absent' };
    if (!res.ok) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Failed to fetch metadata from S3: HTTP ${res.status}`);
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
      return {
        kind: 'unreadable',
        detail: `metadata.json is present but not parsable: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  async getVaultETag(): Promise<string | null> {
    const vaultUrl = this.buildObjectUrl(this.buildKeyPath(VAULT_FILE));
    let headers: Record<string, string>;
    try {
      headers = await this.createSignedHeaders('HEAD', vaultUrl);
    } catch {
      return null;
    }
    try {
      const res = await fetch(vaultUrl, { method: 'HEAD', headers });
      if (!res.ok) return null;
      return res.headers?.get?.('etag') ?? null;
    } catch {
      return null;
    }
  }
}
