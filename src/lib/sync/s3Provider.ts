/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { addSyncAllowedOrigin, isPrivateOrLoopbackHostname, removeSyncAllowedOrigin } from '../airgapNetworkPolicy';
import type { SyncProvider, SyncMetadata, S3SyncConfig } from './syncTypes';
import { SyncError, syncErrorCodes } from './syncTypes';

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

    addSyncAllowedOrigin(this.origin);
  }

  dispose(): void {
    removeSyncAllowedOrigin(this.origin);
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

  async uploadVault(encryptedBlob: string, metadata: SyncMetadata): Promise<void> {
    // 1. Upload vault blob
    const vaultPath = this.buildKeyPath(VAULT_FILE);
    const vaultUrl = this.buildObjectUrl(vaultPath);
    const vaultHeaders = await this.createSignedHeaders('PUT', vaultUrl, encryptedBlob, {
      'content-type': 'application/octet-stream',
    });

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
      throw new SyncError(syncErrorCodes.uploadFailed, `Vault uploaded but metadata write failed on S3: HTTP ${metaRes.status}`);
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

    return res.text();
  }

  async getRemoteMetadata(): Promise<SyncMetadata | null> {
    const metaPath = this.buildKeyPath(METADATA_FILE);
    const metaUrl = this.buildObjectUrl(metaPath);
    const headers = await this.createSignedHeaders('GET', metaUrl);

    let res: Response;
    try {
      res = await fetch(metaUrl, { method: 'GET', headers });
    } catch (err) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Network error fetching metadata from S3: ${String(err)}`);
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      throw new SyncError(syncErrorCodes.downloadFailed, `Failed to fetch metadata from S3: HTTP ${res.status}`);
    }

    try {
      return (await res.json()) as SyncMetadata;
    } catch {
      return null;
    }
  }
}
