const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const MANIFEST_FILENAME = 'KalderaShield-integrity.json';
const SCHEMA_VERSION = 1;
const ALGORITHM = 'SHA-256';

// Y-20, revisited, twice.
//
// index.html was in the manifest so that the document which decides what runs
// could not be rewritten to add a `<script src>`, and that is still the right
// instinct. But putting it in the manifest made every release build fail, and
// the first explanation offered for that here was wrong about the mechanism. It
// claimed Tauri "does not rewrite the file on disk". That is true, and it is not
// what the runtime compares. The check `fetch`es each asset and measures what
// the WebView is *served*.
//
// The actual mechanism, from tauri 2.11.5 src/manager/mod.rs `get_asset`:
//
//     let is_html = asset_path.as_ref().ends_with(".html");
//     let final_data = if is_html {
//       let mut asset = String::from_utf8_lossy(&asset_response).into_owned();
//       if let Some(csp) = self.csp() {
//         let mut csp_map = set_csp(&mut asset, &self.assets, &asset_path, self, csp);
//         ...
//       }
//       asset.into_bytes()
//     } else {
//       asset_response.into_owned()
//     };
//
// Tauri rewrites the bytes of *every* asset whose path ends in `.html`, not
// only the main frame, merging app.security.csp into the document. Non-HTML
// assets are passed through untouched.
//
// Excluding only index.html therefore fixed the document and left a trap. Any
// other .html in the bundle -- public/icon-showcase.html, added with the icon
// set -- is hashed here, served longer by Tauri, and fails as
// `asset-size-mismatch` on every machine, with a warning that tells the user
// their installation may be tampered with. That is exactly what happened:
// v7.0.18.0 shipped with only public/splash.css and verified clean, and every
// build since the icon set has reported a false integrity failure.
//
// So the rule is now the one Tauri actually imposes: no .html file is hashed.
// What replaces byte-level integrity for documents is not less checking of the
// same kind -- the Y-20 counter-check (findUnlistedAssetReferences) still parses
// the served index.html and still fails closed on any reference the manifest
// cannot vouch for, and with every .html unlisted a document reference to one
// is now unlisted by construction and fails closed too. An attacker who adds a
// script to index.html is caught either way. What is given up is byte-level
// integrity for documents, which was never actually enforced: the bytes were
// always compared against a manifest that could not match them.
const INDEX_HTML_PATH = 'index.html';
const isTauriRewrittenHtml = (assetPath) => assetPath.toLowerCase().endsWith('.html');

function walkFiles(dir, output = []) {
  if (!fs.existsSync(dir)) return output;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(fullPath, output);
    else if (entry.isFile()) output.push(fullPath);
  }
  return output;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function canonicalAssetPayload(assets) {
  return [...assets]
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))
    .map((asset) => asset.path + '\0' + asset.sha256 + '\0' + asset.size + '\n')
    .join('');
}

function createAssetEntries(distDir) {
  return walkFiles(distDir)
    .map((file) => ({
      file,
      path: path.relative(distDir, file).replace(/\\/g, '/'),
    }))
    // See the Tauri `get_asset` excerpt above. Every .html is excluded because
    // every .html is rewritten; the manifest and the served bytes could never
    // agree, so hashing one can only ever produce a false failure.
    .filter(
      (entry) =>
        entry.path !== MANIFEST_FILENAME &&
        entry.path !== INDEX_HTML_PATH &&
        !isTauriRewrittenHtml(entry.path) &&
        !entry.path.endsWith('.map')
    )
    .map((entry) => {
      const contents = fs.readFileSync(entry.file);
      return {
        path: entry.path,
        sha256: sha256Buffer(contents),
        size: contents.length,
      };
    })
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function buildIntegrityManifest(assets) {
  return {
    schemaVersion: SCHEMA_VERSION,
    algorithm: ALGORITHM,
    rootSha256: sha256Buffer(Buffer.from(canonicalAssetPayload(assets), 'utf8')),
    assets,
  };
}

function validateIntegrityManifest(manifest, distDir) {
  const issues = [];
  if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION || manifest.algorithm !== ALGORITHM) {
    return ['integrity manifest schema or algorithm is invalid'];
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    return ['integrity manifest contains no assets'];
  }
  const expectedEntries = createAssetEntries(distDir);
  const expected = buildIntegrityManifest(expectedEntries);
  if (manifest.rootSha256 !== expected.rootSha256) issues.push('integrity manifest root does not match dist assets');
  if (JSON.stringify(manifest.assets) !== JSON.stringify(expected.assets)) issues.push('integrity manifest entries do not match dist assets');
  return issues;
}

function generateIntegrityManifest(distDir = path.join(rootDir, 'dist')) {
  if (!fs.existsSync(distDir) || !fs.statSync(distDir).isDirectory()) {
    throw new Error('Production dist directory is missing: ' + distDir);
  }
  const manifest = buildIntegrityManifest(createAssetEntries(distDir));
  const manifestPath = path.join(distDir, MANIFEST_FILENAME);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { manifest, manifestPath };
}

if (require.main === module) {
  const { manifest, manifestPath } = generateIntegrityManifest();
  console.log('Asset integrity manifest written: ' + path.relative(rootDir, manifestPath));
  console.log('Assets: ' + manifest.assets.length);
  console.log('Root SHA-256: ' + manifest.rootSha256);
}

module.exports = {
  ALGORITHM,
  INDEX_HTML_PATH,
  MANIFEST_FILENAME,
  SCHEMA_VERSION,
  buildIntegrityManifest,
  canonicalAssetPayload,
  createAssetEntries,
  generateIntegrityManifest,
  isTauriRewrittenHtml,
  validateIntegrityManifest,
};