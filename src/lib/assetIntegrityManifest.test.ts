import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

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
  generateIntegrityManifest: (dir: string) => { manifest: { rootSha256: string; assets: unknown[] }; manifestPath: string };
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
    expect(manifest.assets).toHaveLength(1);
    expect(manifest.assets[0]).toMatchObject({ path: 'assets/index.js' });
    expect(validateIntegrityManifest(manifest, directory)).toEqual([]);
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