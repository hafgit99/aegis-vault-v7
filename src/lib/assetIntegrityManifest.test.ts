import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

const {
  buildIntegrityManifest,
  canonicalAssetPayload,
  generateIntegrityManifest,
  validateIntegrityManifest,
} = require('../../scripts/generate-asset-integrity-manifest.cjs') as {
  canonicalAssetPayload: (assets: Array<{ path: string; sha256: string; size: number }>) => string;
  buildIntegrityManifest: (assets: Array<{ path: string; sha256: string; size: number }>) => {
    rootSha256: string;
    assets: Array<{ path: string; sha256: string; size: number }>;
  };
  generateIntegrityManifest: (dir: string) => {
    manifest: { rootSha256: string; assets: Array<{ path: string; sha256: string; size: number }> };
    manifestPath: string;
  };
  validateIntegrityManifest: (manifest: unknown, dir: string) => string[];
};

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('asset integrity manifest generator', () => {
  it('uses a deterministic path-sorted canonical payload', () => {
    const a = { path: 'a.js', sha256: 'a'.repeat(64), size: 1 };
    const b = { path: 'b.js', sha256: 'b'.repeat(64), size: 2 };
    expect(canonicalAssetPayload([b, a])).toBe(canonicalAssetPayload([a, b]));
    expect(buildIntegrityManifest([b, a]).rootSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('excludes index.html because Tauri rewrites the served bytes', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-integrity-'));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>Aegis</main>');
    fs.writeFileSync(path.join(directory, 'assets', 'index.js'), 'export {};');

    const { manifest, manifestPath } = generateIntegrityManifest(directory);

    expect(fs.existsSync(manifestPath)).toBe(true);
    // index.html is out of the hashed set because Tauri merges
    // `app.security.csp` into the served document, so the bytes the runtime
    // `fetch`es are not the bytes that were built. Hashing it made every
    // release build fail with `asset-size-mismatch`. The document is still
    // checked at runtime, by the reference counter-check.
    expect(manifest.assets.map((asset: { path: string }) => asset.path).sort()).toEqual([
      'assets/index.js',
    ]);
    expect(validateIntegrityManifest(manifest, directory)).toEqual([]);
  });

  it('does not detect an injected script via the root hash, because the document is not hashed', () => {
    // The honest statement of what the manifest no longer does. Y-20 removed
    // this hash, and pretending otherwise here would assert a guarantee the
    // code no longer makes. Catching this is the runtime counter-check's job,
    // and this is the shape of the attack it has to catch.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-integrity-'));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(
      path.join(directory, 'index.html'),
      '<script type="module" src="/assets/index.js"></script>',
    );
    fs.writeFileSync(path.join(directory, 'assets', 'index.js'), 'export {};');
    const { manifest } = generateIntegrityManifest(directory);

    fs.writeFileSync(
      path.join(directory, 'index.html'),
      '<script type="module" src="/assets/index.js"></script><script src="evil.js"></script>',
    );

    // Every hashed asset is untouched, so the root still matches. This is
    // exactly the gap the runtime reference check covers.
    expect(validateIntegrityManifest(manifest, directory)).toEqual([]);
  });

  it('still excludes the manifest itself and source maps', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-integrity-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>Aegis</main>');
    fs.writeFileSync(path.join(directory, 'app.js'), 'export {};');
    fs.writeFileSync(path.join(directory, 'app.js.map'), '{}');

    const { manifest } = generateIntegrityManifest(directory);

    // The over-correction guard for the filter: "include everything" would make
    // the manifest hash itself, which can never verify. index.html is excluded
    // for the separate reason documented above, and app.js.map because sourcemaps
    // are not part of what the app loads.
    expect(manifest.assets.map((asset: { path: string }) => asset.path).sort()).toEqual([
      'app.js',
    ]);
  });

  it('detects a changed production asset', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-integrity-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, 'index.html'), 'original');
    fs.writeFileSync(path.join(directory, 'assets.js'), 'original');
    const { manifest } = generateIntegrityManifest(directory);

    fs.writeFileSync(path.join(directory, 'assets.js'), 'tampered');

    expect(validateIntegrityManifest(manifest, directory)).toContain('integrity manifest root does not match dist assets');
  });
});