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
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-integrity-'));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>KalderaShield</main>');
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
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-integrity-'));
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
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-integrity-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>KalderaShield</main>');
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
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-integrity-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, 'index.html'), 'original');
    fs.writeFileSync(path.join(directory, 'assets.js'), 'original');
    const { manifest } = generateIntegrityManifest(directory);

    fs.writeFileSync(path.join(directory, 'assets.js'), 'tampered');

    expect(validateIntegrityManifest(manifest, directory)).toContain('integrity manifest root does not match dist assets');
  });

  // The regression below is the reason the filter above is now a class and not
  // a single file. Tauri rewrites the served bytes of *every* .html asset --
  // from tauri 2.11.5 src/manager/mod.rs `get_asset`:
  //
  //     let is_html = asset_path.as_ref().ends_with(".html");
  //     let final_data = if is_html {
  //       let mut asset = String::from_utf8_lossy(&asset_response).into_owned();
  //       if let Some(csp) = self.csp() {
  //         let mut csp_map = set_csp(&mut asset, &self.assets, &asset_path, self, csp);
  //         ...
  //       }
  //       asset.into_bytes()
  //     } else { asset_response.into_owned() };
  //
  // Excluding only index.html left public/icon-showcase.html -- added with the
  // icon set -- hashed against bytes the app is never served. Every build since
  // then reported `asset-size-mismatch` and told the user their installation
  // may have been tampered with. v7.0.18.0, which shipped before that file
  // existed, verified clean.
  it('excludes every html asset, not only the main document', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'KalderaShield-integrity-'));
    temporaryDirectories.push(directory);
    fs.mkdirSync(path.join(directory, 'assets'));
    fs.writeFileSync(path.join(directory, 'index.html'), '<main>KalderaShield</main>');
    fs.writeFileSync(path.join(directory, 'icon-showcase.html'), '<main>showcase</main>');
    fs.writeFileSync(path.join(directory, 'assets', 'Report.HTML'), '<main>nested</main>');
    fs.writeFileSync(path.join(directory, 'assets.js'), 'export {};');

    const { manifest } = generateIntegrityManifest(directory);

    expect(manifest.assets.map((asset: { path: string }) => asset.path).sort()).toEqual([
      'assets.js',
    ]);
  });

  it('recognises every html spelling Tauri rewrites', () => {
    const { isTauriRewrittenHtml } = require('../../scripts/generate-asset-integrity-manifest.cjs') as {
      isTauriRewrittenHtml: (assetPath: string) => boolean;
    };

    expect(isTauriRewrittenHtml('index.html')).toBe(true);
    expect(isTauriRewrittenHtml('icon-showcase.html')).toBe(true);
    // Tauri's check is on the resolved path, and the runtime's list comparison
    // is exact, so a differently-cased suffix has to be excluded too or it is
    // hashed and can never match.
    expect(isTauriRewrittenHtml('nested/Report.HTML')).toBe(true);
    expect(isTauriRewrittenHtml('assets/index-Bxxj4Aio.js')).toBe(false);
    expect(isTauriRewrittenHtml('app-icon.png')).toBe(false);
    // Not an html file that merely contains the letters.
    expect(isTauriRewrittenHtml('assets/htmlish.js')).toBe(false);
  });
});