/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { S3SyncProvider } from './s3Provider';
import type { S3SyncConfig} from './syncTypes';
import { SyncError } from './syncTypes';
import { getSyncAllowedOrigins } from '../airgapNetworkPolicy';

describe('S3SyncProvider', () => {
  const validConfig: S3SyncConfig = {
    type: 's3',
    endpoint: 'https://s3.us-east-1.amazonaws.com',
    region: 'us-east-1',
    bucket: 'my-KalderaShield-bucket',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    prefix: 'KalderaShield',
  };

  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('rejects invalid endpoint URL', () => {
    expect(() => new S3SyncProvider({ ...validConfig, endpoint: 'not-a-url' })).toThrow(
      SyncError,
    );
  });

  it('rejects non-HTTPS endpoint unless loopback or private IP', () => {
    expect(() => new S3SyncProvider({ ...validConfig, endpoint: 'http://s3.example.com' })).toThrow(
      /HTTPS/,
    );
    // Local IP is permitted
    expect(
      () => new S3SyncProvider({ ...validConfig, endpoint: 'http://192.168.1.100:9000' }),
    ).not.toThrow();
  });

  it('registers origin in air-gap whitelist on init and unregisters on dispose', () => {
    const provider = new S3SyncProvider(validConfig);
    expect(getSyncAllowedOrigins().has('https://s3.us-east-1.amazonaws.com')).toBe(true);

    provider.dispose();
    expect(getSyncAllowedOrigins().has('https://s3.us-east-1.amazonaws.com')).toBe(false);
  });

  it('testConnection resolves on HTTP 200 or HTTP 404', async () => {
    const provider = new S3SyncProvider(validConfig);
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    globalThis.fetch = mockFetch;

    await expect(provider.testConnection()).resolves.toBeUndefined();
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]![1]?.headers?.Authorization).toContain('AWS4-HMAC-SHA256');
    provider.dispose();
  });

  it('testConnection throws authFailed on HTTP 403', async () => {
    const provider = new S3SyncProvider(validConfig);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));

    await expect(provider.testConnection()).rejects.toThrow(
      /authentication failed/i,
    );
    provider.dispose();
  });

  it('uploadVault sends PUT requests for vault and metadata', async () => {
    const provider = new S3SyncProvider(validConfig);
    const mockFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    globalThis.fetch = mockFetch;

    const metadata = {
      updatedAt: '2026-08-04T20:00:00.000Z',
      deviceId: 'dev-123',
      vaultVersion: '7.0',
      checksum: 'a'.repeat(64),
      itemCount: 5,
    };

    await provider.uploadVault('encrypted-blob-content', metadata);

    expect(mockFetch).toHaveBeenCalledTimes(2); // 1. vault.KalderaShield, 2. metadata.json
    expect(mockFetch.mock.calls[0]![0]).toContain('my-KalderaShield-bucket/KalderaShield/vault.KalderaShield');
    expect(mockFetch.mock.calls[1]![0]).toContain('my-KalderaShield-bucket/KalderaShield/metadata.json');
    provider.dispose();
  });

  it('downloadVault fetches and returns ciphertext string', async () => {
    const provider = new S3SyncProvider(validConfig);
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('remote-ciphertext', { status: 200 }));

    const res = await provider.downloadVault();
    expect(res).toBe('remote-ciphertext');
    provider.dispose();
  });

  it('getRemoteMetadata distinguishes absent, ok and unreadable', async () => {
    const provider = new S3SyncProvider(validConfig);
    const metaObj = {
      updatedAt: '2026-08-04T20:00:00.000Z',
      deviceId: 'dev-123',
      vaultVersion: '7.0',
      checksum: 'b'.repeat(64),
      itemCount: 10,
    };

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(metaObj), { status: 200, headers: { etag: '"e1"' } }),
    );
    const result = await provider.getRemoteMetadata();
    expect(result.kind).toBe('ok');
    expect(result.kind === 'ok' && result.metadata).toEqual(metaObj);
    expect(result.kind === 'ok' && result.etag).toBe('"e1"');

    globalThis.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await provider.getRemoteMetadata()).toEqual({ kind: 'absent' });

    // Y-11 regression: an unparsable metadata.json must NOT be reported as
    // absent. performSync used to treat it as "no remote" and overwrite the
    // (possibly intact) remote vault.
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('not-json', { status: 200 }));
    const unreadable = await provider.getRemoteMetadata();
    expect(unreadable.kind).toBe('unreadable');
    expect(unreadable.kind === 'unreadable' && unreadable.detail).toBeTruthy();

    // Network error throws SyncError
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('S3 down'));
    await expect(provider.getRemoteMetadata()).rejects.toThrow(/Network error/);

    // HTTP 500 throws SyncError
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 }));
    await expect(provider.getRemoteMetadata()).rejects.toThrow(/Failed to fetch metadata/);

    provider.dispose();
  });
});
