// @vitest-environment jsdom
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  canonicalAssetPayload,
  collectDocumentAssetReferences,
  findUnlistedAssetReferences,
  verifyRuntimeAssetIntegrity,
} from './assetIntegrity';

const invokeMock = vi.hoisted(() => vi.fn());
const isDesktopRuntimeMock = vi.hoisted(() => vi.fn());
const isAndroidRuntimeMock = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('./desktopStorage', () => ({
  isAndroidRuntime: isAndroidRuntimeMock,
  isDesktopRuntime: isDesktopRuntimeMock,
}));

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
    isAndroidRuntimeMock.mockReset();
    vi.unstubAllGlobals();
    isDesktopRuntimeMock.mockReturnValue(true);
    isAndroidRuntimeMock.mockReturnValue(false);
  });

  it('skips browser and debug runtimes', async () => {
    isDesktopRuntimeMock.mockReturnValue(false);
    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'skipped', reason: 'browser-runtime' });

    isDesktopRuntimeMock.mockReturnValue(true);
    isAndroidRuntimeMock.mockReturnValue(false);
    invokeMock.mockResolvedValue({ schemaVersion: 1, algorithm: 'SHA-256', rootSha256: '', production: false });
    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'skipped', reason: 'debug-build' });
  });

  it('uses Android APK signing as the package integrity boundary', async () => {
    isAndroidRuntimeMock.mockReturnValue(true);
    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'skipped',
      reason: 'android-signed-package',
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('verifies the manifest root and every packaged asset', async () => {
    // index.html is not in the manifest (Tauri rewrites the served bytes), so
    // it is fetched separately and only its references are checked.
    const indexHtml = new TextEncoder().encode(
      '<!doctype html><html><head><script type="module" src="/assets/index.js"></script></head><body></body></html>',
    );
    const script = new TextEncoder().encode('export {};');
    const assets = [{ path: 'assets/index.js', sha256: hash(script), size: script.byteLength }];
    const rootSha256 = hash(canonicalAssetPayload(assets));
    const manifest = { schemaVersion: 1, algorithm: 'SHA-256', rootSha256, assets };

    invokeMock.mockResolvedValue({ ...manifest, production: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(script))
      .mockResolvedValueOnce(responseBytes(indexHtml));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({ status: 'verified', assetCount: 1 });
    expect(fetchMock).toHaveBeenNthCalledWith(2, './assets/index.js', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    // The document is read last, and read but never hashed.
    expect(fetchMock).toHaveBeenNthCalledWith(3, './index.html', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
  });

  it('fails closed when index.html is hashed into the manifest', async () => {
    // The mirror image of the exclusion. If the generator's filter ever stops
    // excluding index.html, the document would be in the hashed set and the
    // counter-check below would reason about bytes that were never verified --
    // worse than not checking it at all, because it would look checked.
    const indexHtml = new TextEncoder().encode('<!doctype html><html><head></head></html>');
    const assets = [{ path: 'index.html', sha256: hash(indexHtml), size: indexHtml.byteLength }];
    const manifest = {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      rootSha256: hash(canonicalAssetPayload(assets)),
      assets,
    };

    invokeMock.mockResolvedValue({ ...manifest, production: true });
    const fetchMock = vi.fn().mockResolvedValueOnce(responseJson(manifest));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'failed',
      reason: 'html-asset-listed-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when any other .html asset is hashed into the manifest', async () => {
    // The bug this whole change exists for. Excluding only index.html left
    // every other bundled .html hashed against bytes Tauri rewrites, and
    // public/icon-showcase.html did exactly that: a correct build reported
    // asset-size-mismatch and told the user their install may be tampered with.
    // The exclusion has to be the whole class, not one member of it.
    const page = new TextEncoder().encode('<!doctype html><html><body>showcase</body></html>');
    const script = new TextEncoder().encode('export {};');
    const assets = [
      { path: 'assets/index.js', sha256: hash(script), size: script.byteLength },
      { path: 'icon-showcase.html', sha256: hash(page), size: page.byteLength },
    ];
    const manifest = {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      rootSha256: hash(canonicalAssetPayload(assets)),
      assets,
    };

    invokeMock.mockResolvedValue({ ...manifest, production: true });
    // Only the manifest is ever fetched: the check must refuse before it
    // measures a single asset.
    const fetchMock = vi.fn().mockResolvedValueOnce(responseJson(manifest));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'failed',
      reason: 'html-asset-listed-1',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts a manifest with no .html in it at all', async () => {
    // The shape every correct build now has: documents present in dist, absent
    // from the manifest. This is the case that used to be impossible to satisfy
    // while a second .html was in the bundle.
    const script = new TextEncoder().encode('export {};');
    const assets = [{ path: 'assets/index.js', sha256: hash(script), size: script.byteLength }];
    const manifest = {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      rootSha256: hash(canonicalAssetPayload(assets)),
      assets,
    };

    invokeMock.mockResolvedValue({ ...manifest, production: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(script))
      .mockResolvedValueOnce(responseBytes(
        new TextEncoder().encode('<!doctype html><html><head></head><body></body></html>'),
      ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'verified',
      assetCount: 1,
    });
  });

  it('names the offending asset in a size mismatch', async () => {
    // A bare `asset-size-mismatch` across nineteen assets is what made the
    // false failure above take a full diagnosis cycle. The two sizes are the
    // part that distinguishes a Tauri-side rewrite from an altered file.
    const short = new TextEncoder().encode('ab');
    const long = new TextEncoder().encode('abcd');
    const assets = [{ path: 'app-icon.png', sha256: hash(short), size: short.byteLength }];
    const manifest = {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      rootSha256: hash(canonicalAssetPayload(assets)),
      assets,
    };

    invokeMock.mockResolvedValue({ ...manifest, production: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(long));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'failed',
      reason: 'asset-size-mismatch-2-vs-4-app-icon-png',
    });
  });

  it('fails closed when the verified document references an unlisted script', async () => {
    // The counter-check, and the reason index.html is still verified at all
    // even though it is no longer hashed. Every hashed asset is untouched and
    // the root matches: this is not a tamper a hash comparison would catch. The
    // document asks for a file the manifest cannot vouch for, and that is the
    // Y-20 attack -- so the exclusion traded a hash that could never match for
    // a check that actually runs.
    const tamperedHtml = new TextEncoder().encode(
      '<!doctype html><html><head>'
      + '<script type="module" src="/assets/index.js"></script>'
      + '<script src="evil.js"></script>'
      + '</head><body></body></html>',
    );
    const script = new TextEncoder().encode('export {};');
    const assets = [{ path: 'assets/index.js', sha256: hash(script), size: script.byteLength }];
    const manifest = {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      rootSha256: hash(canonicalAssetPayload(assets)),
      assets,
    };
    invokeMock.mockResolvedValue({ ...manifest, production: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(script))
      .mockResolvedValueOnce(responseBytes(tamperedHtml));
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'failed',
      reason: 'unlisted-asset-reference',
    });
  });

  it('fails closed when the document cannot be read at all', async () => {
    // No index.html means no counter-check is possible. Reporting `verified`
    // here would be the silent pass this whole function exists to prevent.
    const script = new TextEncoder().encode('export {};');
    const assets = [{ path: 'assets/index.js', sha256: hash(script), size: script.byteLength }];
    const manifest = {
      schemaVersion: 1,
      algorithm: 'SHA-256',
      rootSha256: hash(canonicalAssetPayload(assets)),
      assets,
    };
    invokeMock.mockResolvedValue({ ...manifest, production: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(script))
      .mockResolvedValueOnce({ ok: false, arrayBuffer: vi.fn() });
    vi.stubGlobal('fetch', fetchMock);

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'failed',
      reason: 'index-html-unavailable',
    });
  });

  it('fails closed for a manifest root mismatch', async () => {
    const assets = [{ path: 'assets/index.js', sha256: 'a'.repeat(64), size: 1 }];
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
    const assets = [{ path: 'assets/index.js', sha256: hash(expected), size: modified.byteLength }];
    const rootSha256 = hash(canonicalAssetPayload(assets));
    const manifest = { schemaVersion: 1, algorithm: 'SHA-256', rootSha256, assets };
    invokeMock.mockResolvedValue({ schemaVersion: 1, algorithm: 'SHA-256', rootSha256, production: true });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(responseJson(manifest))
      .mockResolvedValueOnce(responseBytes(modified)));

    await expect(verifyRuntimeAssetIntegrity()).resolves.toEqual({
      status: 'failed',
      reason: 'asset-hash-mismatch-assets-index-js',
    });
  });
});

describe('Y-20 asset reference counter-check', () => {
  const listed = ['index.html', 'assets/index.js', 'assets/app.css', 'splash.css'];

  it('flags a local reference the manifest does not cover', () => {
    expect(findUnlistedAssetReferences(listed, ['/assets/index.js'])).toEqual([]);
    expect(findUnlistedAssetReferences(listed, ['/assets/evil.js'])).toEqual(['/assets/evil.js']);
  });

  it('accepts the site-absolute and relative forms of a listed asset', () => {
    // The document writes "/assets/index.js"; the manifest stores
    // "assets/index.js". Treating those as different files would fail every
    // real build, so the normalisation is load-bearing, not cosmetic.
    expect(findUnlistedAssetReferences(listed, ['/assets/index.js', 'assets/app.css'])).toEqual([]);
  });

  it('leaves non-local references alone', () => {
    // The over-correction guard. "Reject every reference the manifest does not
    // list" is the tempting over-fix, and it breaks the app for two reasons
    // that have nothing to do with security: the app builds `blob:` URLs for
    // attachments it just decrypted, and `data:` URIs are used for inline
    // images. Neither is a bundled file, and neither is attacker-controlled.
    expect(findUnlistedAssetReferences(listed, [
      'blob:tauri://localhost/9f2c-4a1b',
      'data:image/png;base64,iVBORw0KGgo=',
      'https://asset.localhost/icon.png',
      '//cdn.example.com/x.js',
    ])).toEqual([]);
  });

  it('does not normalise a traversal attempt into something listed', () => {
    // A second over-correction: "strip ../ and then look it up". That turns an
    // escape out of dist into a lookup that could plausibly succeed.
    expect(findUnlistedAssetReferences(listed, ['/assets/../../evil.js'])).toEqual([
      '/assets/../../evil.js',
    ]);
    expect(findUnlistedAssetReferences(listed, ['../index.html'])).toEqual(['../index.html']);
  });

  it('collects the asset URLs a document asks to load', () => {
    const html = [
      '<!doctype html><html><head>',
      '<link rel="icon" href="/assets/icon.png">',
      '<link rel="stylesheet" href="/splash.css">',
      '<script type="module" src="/assets/index.js"></script>',
      '<script>console.log("inline, no src")</script>',
      '</head><body><img src="blob:tauri://localhost/x"></body></html>',
    ].join('');

    expect(collectDocumentAssetReferences(html)).toEqual([
      '/assets/icon.png',
      '/splash.css',
      '/assets/index.js',
      'blob:tauri://localhost/x',
    ]);
  });

  it('finds nothing unlisted in the real built document', () => {
    // Guards against the counter-check false-positiving on the actual build
    // shape: hashed filenames, a splash stylesheet and a modulepreload set.
    // The paths below are copied from a real dist/index.html.
    const html = [
      '<!doctype html><html lang="tr" class="dark splash-root"><head>',
      '<link rel="icon" type="image/png" href="/assets/KalderaShield-app-icon-zGEMGRK0.png">',
      '<link rel="stylesheet" href="/splash.css">',
      '<script type="module" crossorigin src="/assets/index-Cr3DG0Y1.js"></script>',
      '<link rel="modulepreload" crossorigin href="/assets/rolldown-runtime-DS2seoW7.js">',
      '<link rel="modulepreload" crossorigin href="/assets/react-vendor-DPx6u12k.js">',
      '<link rel="stylesheet" crossorigin href="/assets/index-Bzi1NMM1.css">',
      '</head><body><div id="root"></div></body></html>',
    ].join('');

    // index.html is absent because it is no longer hashed. That is the real
    // manifest shape -- a document never references itself, so nothing here
    // changes for the document, but the list has to match what the generator
    // actually emits or this test stops guarding anything.
    const manifestPaths = [
      'splash.css',
      'assets/KalderaShield-app-icon-zGEMGRK0.png',
      'assets/index-Cr3DG0Y1.js',
      'assets/rolldown-runtime-DS2seoW7.js',
      'assets/react-vendor-DPx6u12k.js',
      'assets/index-Bzi1NMM1.css',
    ];

    expect(findUnlistedAssetReferences(manifestPaths, collectDocumentAssetReferences(html))).toEqual([]);
  });
});
