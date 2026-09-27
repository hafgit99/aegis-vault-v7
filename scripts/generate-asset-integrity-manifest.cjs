const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const MANIFEST_FILENAME = 'aegis-integrity.json';
const SCHEMA_VERSION = 1;
const ALGORITHM = 'SHA-256';

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
    // Y-20: index.html is now included. It used to be excluded on the stated
    // grounds that "Tauri injects the configured CSP into index.html at
    // runtime, so the on-disk bytes differ from the served ones". That is not
    // how Tauri v2 works, and leaving the exclusion in place was the whole
    // finding: index.html is the document that loads every other script, and it
    // was the only file in dist/ with no integrity guarantee at all. A local
    // write to dist/index.html adding `<script src="evil.js">` left the root
    // hash matching and the check returning {status:'verified'}.
    //
    // Verified empirically for this project rather than assumed:
    //   - Tauri v2 serves the custom protocol with `security.csp` applied as a
    //     *response header*. It does not rewrite the file on disk.
    //   - tauri.conf.json's CSP and the CSP <meta> in the built dist/index.html
    //     are different strings, and the latter is byte-identical to the one in
    //     the source index.html template.
    // So the bytes hashed here are the bytes the WebView loads.
    .filter((entry) => entry.path !== MANIFEST_FILENAME && !entry.path.endsWith('.map'))
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