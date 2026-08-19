/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebDavSyncProvider } from './webdavProvider';
import { SyncError, syncErrorCodes } from './syncTypes';
import { addSyncAllowedOrigin } from '../airgapNetworkPolicy';

// Allow test origins through the air-gap policy
addSyncAllowedOrigin('https://nc.test.local');
addSyncAllowedOrigin('http://localhost:8080');
addSyncAllowedOrigin('http://172.16.0.2:8080');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildProvider(url = 'https://nc.test.local/', user = 'alice', pass = 'secret'): WebDavSyncProvider {
  return new WebDavSyncProvider(url, user, pass);
}

function mockFetch(impl: (url: string, opts: RequestInit) => Response | Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(impl as any);
}

function makeResponse(status: number, body = ''): Response {
  // jsdom's Response constructor does not accept 204 (No Content) directly.
  // Use 200 for all success cases in tests.
  const safeStatus = status === 204 ? 200 : status;
  return new Response(body, { status: safeStatus });
}

function makeJsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ─── Constructor Tests ────────────────────────────────────────────────────────

describe('WebDavSyncProvider constructor', () => {
  it('accepts HTTPS URLs', () => {
    expect(() => buildProvider('https://nc.test.local/')).not.toThrow();
  });

  it('accepts localhost URLs (dev/testing)', () => {
    expect(() => new WebDavSyncProvider('http://localhost:8080/', 'u', 'p')).not.toThrow();
  });

  it('accepts RFC 1918 172.16/12 URLs for local WebDAV testing', () => {
    expect(() => new WebDavSyncProvider('http://172.16.0.2:8080/', 'u', 'p')).not.toThrow();
  });

  it('rejects plain HTTP non-local URLs', () => {
    expect(() => new WebDavSyncProvider('http://remote.example.com/', 'u', 'p')).toThrow(SyncError);
    expect(() => new WebDavSyncProvider('http://172.32.0.2:8080/', 'u', 'p')).toThrow(SyncError);
  });

  it('normalises URLs without trailing slash', () => {
    // Should not throw and should internally add trailing slash
    expect(() => buildProvider('https://nc.test.local')).not.toThrow();
  });
});

// ─── testConnection Tests ─────────────────────────────────────────────────────

describe('WebDavSyncProvider.testConnection', () => {
  afterEach(() => vi.restoreAllMocks());

  it('resolves on 207 Multi-Status', async () => {
    mockFetch(() => makeResponse(207));
    const provider = buildProvider();
    await expect(provider.testConnection()).resolves.toBeUndefined();
  });

  it('resolves on 200 OK', async () => {
    mockFetch(() => makeResponse(200));
    await expect(buildProvider().testConnection()).resolves.toBeUndefined();
  });

  it('throws SyncError with authFailed on 401', async () => {
    mockFetch(() => makeResponse(401));
    await expect(buildProvider().testConnection()).rejects.toMatchObject({ code: syncErrorCodes.authFailed });
  });

  it('throws SyncError with authFailed on 403', async () => {
    mockFetch(() => makeResponse(403));
    await expect(buildProvider().testConnection()).rejects.toMatchObject({ code: syncErrorCodes.authFailed });
  });

  it('throws SyncError with connectionFailed on 500', async () => {
    mockFetch(() => makeResponse(500));
    await expect(buildProvider().testConnection()).rejects.toMatchObject({ code: syncErrorCodes.connectionFailed });
  });

  it('throws SyncError on network error', async () => {
    mockFetch(() => { throw new TypeError('Failed to fetch'); });
    await expect(buildProvider().testConnection()).rejects.toMatchObject({ code: syncErrorCodes.connectionFailed });
  });
});

// ─── uploadVault Tests ────────────────────────────────────────────────────────

describe('WebDavSyncProvider.uploadVault', () => {
  afterEach(() => vi.restoreAllMocks());

  it('makes MKCOL then two PUT requests', async () => {
    const calls: string[] = [];
    mockFetch((url, opts) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      calls.push(method);
      // All success responses use 200 for jsdom compatibility
      return makeResponse(200);
    });

    const metadata = {
      updatedAt: '2024-01-01T00:00:00Z',
      deviceId: 'test',
      vaultVersion: '7.0',
      checksum: 'abc',
      itemCount: 1,
    };
    await buildProvider().uploadVault('{"encrypted":"data"}', metadata);
    expect(calls).toContain('MKCOL');
    expect(calls.filter(m => m === 'PUT').length).toBe(2);
  });

  it('throws uploadFailed when vault PUT returns 503', async () => {
    mockFetch((url, opts) => {
      const method = (opts?.method ?? 'GET').toUpperCase();
      // MKCOL succeeds, PUT fails
      return makeResponse(method === 'MKCOL' ? 200 : 503);
    });

    const metadata = { updatedAt: '', deviceId: '', vaultVersion: '', checksum: '', itemCount: 0 };
    await expect(buildProvider().uploadVault('blob', metadata)).rejects.toMatchObject({ code: syncErrorCodes.uploadFailed });
  });
});

// ─── downloadVault Tests ──────────────────────────────────────────────────────

describe('WebDavSyncProvider.downloadVault', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null on 404', async () => {
    mockFetch(() => makeResponse(404));
    const result = await buildProvider().downloadVault();
    expect(result).toBeNull();
  });

  it('returns string content on 200', async () => {
    mockFetch(() => makeResponse(200, 'encrypted-blob'));
    const result = await buildProvider().downloadVault();
    expect(result).toBe('encrypted-blob');
  });

  it('throws downloadFailed on server error', async () => {
    mockFetch(() => makeResponse(500));
    await expect(buildProvider().downloadVault()).rejects.toMatchObject({ code: syncErrorCodes.downloadFailed });
  });
});

// ─── getRemoteMetadata Tests ──────────────────────────────────────────────────

describe('WebDavSyncProvider.getRemoteMetadata', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null on 404', async () => {
    mockFetch(() => makeResponse(404));
    const result = await buildProvider().getRemoteMetadata();
    expect(result).toBeNull();
  });

  it('parses valid metadata JSON', async () => {
    const metadata = {
      updatedAt: '2024-01-01T00:00:00Z',
      deviceId: 'dev1',
      vaultVersion: '7.0',
      checksum: 'abc123',
      itemCount: 5,
    };
    mockFetch(() => makeJsonResponse(200, metadata));
    const result = await buildProvider().getRemoteMetadata();
    expect(result?.deviceId).toBe('dev1');
    expect(result?.itemCount).toBe(5);
  });

  it('returns null on corrupt JSON', async () => {
    mockFetch(() => makeResponse(200, '{bad json'));
    const result = await buildProvider().getRemoteMetadata();
    expect(result).toBeNull();
  });

  it('throws downloadFailed on network error and HTTP 500 in getRemoteMetadata', async () => {
    mockFetch(() => { throw new TypeError('offline'); });
    await expect(buildProvider().getRemoteMetadata()).rejects.toMatchObject({
      code: syncErrorCodes.downloadFailed,
    });

    mockFetch(() => makeResponse(500));
    await expect(buildProvider().getRemoteMetadata()).rejects.toMatchObject({
      code: syncErrorCodes.downloadFailed,
    });
  });
});

// ─── Auth Header Tests ────────────────────────────────────────────────────────

describe('WebDavSyncProvider auth header', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sends Basic Auth header with correct encoding', async () => {
    let capturedHeaders: HeadersInit | undefined;
    mockFetch((url, opts) => {
      capturedHeaders = opts?.headers;
      return makeResponse(207);
    });

    await new WebDavSyncProvider('https://nc.test.local/', 'alice', 'sifre-unicode').testConnection();

    const auth = (capturedHeaders as Record<string, string>)?.Authorization;
    expect(auth).toMatch(/^Basic /);
    const decoded = atob(auth!.replace('Basic ', ''));
    expect(new TextDecoder().decode(Uint8Array.from(decoded, (char) => char.charCodeAt(0)))).toBe('alice:sifre-unicode');
  });
});
