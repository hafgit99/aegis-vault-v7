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