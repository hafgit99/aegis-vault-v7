/**
 * @file scripts/generate-updater-manifest.cjs
 * @description Generates a Tauri v2 compliant `latest.json` updater manifest for local releases.
 * Reads generated artifacts and signature files from release-local/ and produces
 * the distribution manifest ready for uploading to GitHub Releases or self-hosted servers.
 *
 * @license Apache-2.0
 */

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));
const releaseLocalDir = path.join(rootDir, 'release-local');
const updaterOutputDir = path.join(releaseLocalDir, 'updater');

const version = packageJson.version; // full numeric version, e.g. 7.0.5.0
const repoUrl = packageJson.repository ? packageJson.repository.replace(/\.git$/, '') : 'https://github.com/hafgit99/aegis-vault-v7';
const releaseTag = `v${version}`;
const downloadBaseUrl = `${repoUrl}/releases/download/${releaseTag}`;

const TAURI_MINISIGN_COMMENT = 'untrusted comment: signature from tauri secret key';

/**
 * Reads a Tauri updater signature file and validates it as a genuine Tauri
 * minisign signature. Tauri CLI writes the .sig file as the base64 encoding of
 * the minisign document (single line), while some toolchains emit plain
 * minisign ASCII. Both are accepted; the original file content is returned
 * because the updater expects the .sig file contents verbatim.
 * Returns null when the file is not a Tauri minisign signature.
 */
function readTauriSignature(sigFilePath) {
  let raw;
  try {
    raw = fs.readFileSync(sigFilePath, 'utf8').trim();
  } catch (_) {
    return null;
  }
  if (raw.includes(TAURI_MINISIGN_COMMENT)) return raw;
  if (/^[A-Za-z0-9+/=]+$/.test(raw)) {
    try {
      const decoded = Buffer.from(raw, 'base64').toString('utf8');
      if (decoded.includes(TAURI_MINISIGN_COMMENT)) return raw;
    } catch (_) { /* fall through */ }
  }
  return null;
}

/**
 * Maps an updater artifact file name to the Tauri updater platform keys it
 * serves. Only bundles the updater can actually install are mapped:
 *   windows: .exe (NSIS) -> windows-x86_64-nsis + windows-x86_64,
 *            .msi        -> windows-x86_64-msi
 *   macos:   .app.tar.gz -> universal + intel + apple silicon keys
 *   linux:   .AppImage   -> linux-x86_64 + x86_64-unknown-linux-gnu
 * (.dmg/.deb/.rpm are installers but not updater-supported bundles.)
 */
function updaterKeysForArtifact(platformName, fileName) {
  const f = fileName.toLowerCase();
  if (platformName === 'windows') {
    if (f.endsWith('.msi')) return ['windows-x86_64-msi'];
    if (f.endsWith('.exe')) return ['windows-x86_64-nsis', 'windows-x86_64'];
    return [];
  }
  if (platformName === 'macos') {
    if (f.endsWith('.app.tar.gz')) {
      return ['universal-apple-darwin', 'darwin-x86_64', 'darwin-aarch64'];
    }
    return [];
  }
  if (platformName === 'linux') {
    if (f.endsWith('.appimage')) return ['linux-x86_64', 'x86_64-unknown-linux-gnu'];
    return [];
  }
  return [];
}

function generateManifest() {
  console.log(`\n📦 Generating Tauri v2 Auto-Updater Manifest (latest.json) for v${version}...`);

  if (!fs.existsSync(updaterOutputDir)) {
    fs.mkdirSync(updaterOutputDir, { recursive: true });
  }

  // Load release notes if available
  let releaseNotes = `Aegis Vault ${version} Release`;
  const releaseNotesPath = path.join(releaseLocalDir, 'windows', 'RELEASE_NOTES.md');
  if (fs.existsSync(releaseNotesPath)) {
    try {
      releaseNotes = fs.readFileSync(releaseNotesPath, 'utf8').trim();
    } catch (_) {}
  }

  const manifest = {
    version: version,
    notes: releaseNotes,
    pub_date: new Date().toISOString(),
    platforms: {},
  };

  // Scan release-local directories for platform packages & signatures
  const platformNames = ['windows', 'macos', 'linux'];

  for (const platformName of platformNames) {
    const platformDir = path.join(releaseLocalDir, platformName);
    if (!fs.existsSync(platformDir)) continue;

    for (const file of fs.readdirSync(platformDir)) {
      if (!file.endsWith('.sig')) continue;

      const signature = readTauriSignature(path.join(platformDir, file));
      if (!signature) continue;

      const bundleFileName = file.replace(/\.sig$/, '');
      const bundleFilePath = path.join(platformDir, bundleFileName);
      if (!fs.existsSync(bundleFilePath)) continue;

      const targetKeys = updaterKeysForArtifact(platformName, bundleFileName);
      if (targetKeys.length === 0) continue;

      const downloadUrl = `${downloadBaseUrl}/${encodeURIComponent(bundleFileName)}`;

      for (const targetKey of targetKeys) {
        manifest.platforms[targetKey] = {
          signature: signature,
          url: downloadUrl,
        };
      }
    }
  }

  const manifestPath = path.join(updaterOutputDir, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✓ Updater manifest written to: ${path.relative(rootDir, manifestPath)}`);
  console.log(`  Target Version: v${version}`);
  console.log(`  Target Platforms Configured: ${Object.keys(manifest.platforms).join(', ') || 'None (Signatures pending build)'}`);
  console.log(`  Download Base URL: ${downloadBaseUrl}\n`);
}

generateManifest();
