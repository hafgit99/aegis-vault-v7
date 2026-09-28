const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const MANIFEST_FILENAME = 'aegis-integrity.json';
const SCHEMA_VERSION = 1;
const ALGORITHM = 'SHA-256';

// Y-20, revisited. index.html was in the manifest so that the document which
// decides what runs could not be rewritten to add a `<script src>`, and that is
// still the right instinct. But putting it in the manifest made every release
// build fail, and it is worth being precise about why, because the earlier
// comment here was wrong about the mechanism:
//
//   It claimed Tauri "does not rewrite the file on disk". That is true, and it
//   is not what the runtime compares. The check `fetch`es the document and
//   hashes what the WebView is *served*. Tauri v2 applies `app.security.csp`
//   to the served bytes, merging it with the CSP <meta> already in the
//   document -- in this project those two strings genuinely differ (tauri.conf
//   adds the updater and release hosts to connect-src), so the served document
//   is longer than the file on disk. Result: `asset-size-mismatch` on every
//   release build, on every machine, with nothing wrong with the build.
//
// So index.html is excluded from the hashed set. What replaces it is not less
// checking of the same kind: the Y-20 counter-check (findUnlistedAssetReferences)
// still parses the served document and still fails closed on any reference the
// manifest cannot vouch for. That is the property the exclusion was for, and an
// attacker who adds a script to index.html is caught by it. What is given up
// is only byte-level integrity for the document itself -- which was never
// actually enforced, since the bytes were always compared against a manifest
// that could not match them.
const INDEX_HTML_PATH = 'index.html';

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
    // See INDEX_HTML_PATH above. The document is still checked, just not hashed.
    .filter((entry) => entry.path !== MANIFEST_FILENAME && entry.path !== INDEX_HTML_PATH && !entry.path.endsWith('.map'))
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
  MANIFEST_FILENAME,
  SCHEMA_VERSION,
  buildIntegrityManifest,
  canonicalAssetPayload,
  createAssetEntries,
  generateIntegrityManifest,
  validateIntegrityManifest,
};