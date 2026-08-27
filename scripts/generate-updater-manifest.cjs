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

const version = packageJson.version.replace(/\.0$/, ''); // e.g. 7.0.2
const repoUrl = packageJson.repository ? packageJson.repository.replace(/\.git$/, '') : 'https://github.com/hafgit99/aegis-vault-v7';
const releaseTag = `v${version}`;
const downloadBaseUrl = `${repoUrl}/releases/download/${releaseTag}`;

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
  const platformMap = {
    windows: ['windows-x86_64', 'x86_64-pc-windows-msvc'],
    macos: ['darwin-x86_64', 'darwin-aarch64', 'universal-apple-darwin'],
    linux: ['linux-x86_64', 'x86_64-unknown-linux-gnu'],
  };

  for (const [platformName, targetKeys] of Object.entries(platformMap)) {
    const platformDir = path.join(releaseLocalDir, platformName);
    if (!fs.existsSync(platformDir)) continue;

    const files = fs.readdirSync(platformDir);
    for (const file of files) {
      if (file.endsWith('.sig')) {
        const bundleFileName = file.replace(/\.sig$/, '');
        const bundleFilePath = path.join(platformDir, bundleFileName);
        const sigFilePath = path.join(platformDir, file);

        if (fs.existsSync(bundleFilePath)) {
          const signature = fs.readFileSync(sigFilePath, 'utf8').trim();
          const downloadUrl = `${downloadBaseUrl}/${encodeURIComponent(bundleFileName)}`;

          for (const targetKey of targetKeys) {
            manifest.platforms[targetKey] = {
              signature: signature,
              url: downloadUrl,
            };
          }
        }
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
