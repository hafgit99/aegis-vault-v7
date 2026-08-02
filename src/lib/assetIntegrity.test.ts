import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { canonicalAssetPayload, verifyRuntimeAssetIntegrity } from './assetIntegrity';

const invokeMock = vi.hoisted(() => vi.fn());
const isDesktopRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('./desktopStorage', () => ({ isDesktopRuntime: isDesktopRuntimeMock }));

function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function responseJson(value: unknown) {
  return { ok: true, json: vi.fn().mockResolvedValue(value) };
}

function responseBytes(value: Uint8Array) {
  return {
    ok: true,
    arrayBuffer: vi.fn().mockResolvedValue(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)),
  };
}

describe('runtime asset integrity', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    isDesktopRuntimeMock.mockReset();
    vi.unstubAllGlobals();
    isDesktopRuntimeMock.mockReturnValue(true);
  });

  it('skips browser and debug runtimes', async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'skipped', reason: 'browser-runtime' });

    isDesktopRuntimeMock.mockReturnValue(true);
    invokeMock.mockResolvedValue({ schemaVersion: 1, algorithm: 'SHA-256', rootSha256: '', production: false });
    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'skipped', reason: 'debug-build' });
  });

  it('verifies the manifest root and every packaged asset', async () => {
    const contents = new TextEncoder().encode('Aegis asset');
    const assets = [{ path: 'assets/index.js', sha256: hash(contents), size: contents.byteLength }];
    const rootSha256 = hash(canonicalAssetPayload(assets));
    const manifest = { schemaVersion: 1, algorithm: 'SHA-256', rootSha256, assets };

    invokeMock.mockResolvedValue({ ...manifest, production: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(contents));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'verified', assetCount: 1 });
    expect(fetchMock).toHaveBeenNthCalledWith(2, './assets/index.js', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  });

  it('fails closed for a manifest root mismatch', async () => {
    const assets = [{ path: 'index.html', sha256: 'a'.repeat(64), size: 1 }];
    const manifest = {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      rootSha256: hash(canonicalAssetPayload(assets)),
      assets,
    };
    invokeMock.mockResolvedValue({ schemaVersion: 1, algorithm: 'SHA-256', rootSha256: 'b'.repeat(64), production: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(responseJson(manifest)));

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'failed', reason: 'manifest-root-mismatch' });
  });

  it('rejects a modified asset after the root is anchored', async () => {
    const expected = new TextEncoder().encode('expected');
    const modified = new TextEncoder().encode('modified');
    const assets = [{ path: 'index.html', sha256: hash(expected), size: modified.byteLength }];
    const rootSha256 = hash(canonicalAssetPayload(assets));
    const manifest = { schemaVersion: 1, algorithm: 'SHA-256', rootSha256, assets };
    invokeMock.mockResolvedValue({ schemaVersion: 1, algorithm: 'SHA-256', rootSha256, production: true });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(modified)));

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'failed', reason: 'asset-hash-mismatch' });
  });
});