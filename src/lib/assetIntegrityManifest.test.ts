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

  it('generates and validates static production assets without self-hashing the manifest', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-integrity-'));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>Aegis</main>');
    fs.writeFileSync(path.join(directory, 'assets', 'index.js'), 'export {};');

    const { manifest, manifestPath } = generateIntegrityManifest(directory);

    expect(fs.existsSync(manifestPath)).toBe(true);
    // Y-20: index.html is included. It used to be filtered out, which left the
    // document that loads every other script as the one unhashed file in dist/.
    expect(manifest.assets.map((asset: { path: string }) => asset.path).sort()).toEqual([
      'assets/index.js',
      'index.html',
    ]);
    expect(validateIntegrityManifest(manifest, directory)).toEqual([]);
  });

  it('catches a script injected into index.html', async () => {
    // Y-20: the actual attack. Every other asset is untouched, so the root hash
    // of a manifest that excluded index.html still matched and the runtime check
    // returned {status:'verified'} while attacker JS was loading.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-integrity-'));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(
      path.join(directory, 'index.html'),
      '<script type="module" src="/assets/index.js"></script>',
    );
    fs.writeFileSync(path.join(directory, 'assets', 'index.js'), 'export {};');
    const { manifest } = generateIntegrityManifest(directory);
    expect(validateIntegrityManifest(manifest, directory)).toEqual([]);

    fs.writeFileSync(
      path.join(directory, 'index.html'),
      '<script type="module" src="/assets/index.js"></script><script src="evil.js"></script>',
    );

    expect(validateIntegrityManifest(manifest, directory)).toContain(
      'integrity manifest root does not match dist assets',
    );
  });

  it('still excludes the manifest itself and source maps', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-integrity-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>Aegis</main>');
    fs.writeFileSync(path.join(directory, 'app.js'), 'export {};');
    fs.writeFileSync(path.join(directory, 'app.js.map'), '{}');

    const { manifest } = generateIntegrityManifest(directory);

    // The over-correction guard for the filter: "include everything" would make
    // the manifest hash itself, which can never verify.
    expect(manifest.assets.map((asset: { path: string }) => asset.path).sort()).toEqual([
      'app.js',
      'index.html',
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