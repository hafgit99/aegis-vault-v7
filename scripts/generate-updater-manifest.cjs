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
    windows: ['windows-x86_64-nsis', 'windows-x86_64', 'x86_64-pc-windows-msvc'],
    macos: ['darwin-x86_64', 'darwin-aarch64', 'universal-apple-darwin'],
    linux: ['linux-x86_64', 'x86_64-unknown-linux-gnu'],
  };

  for (const [platformName, targetKeys] of Object.entries(platformMap)) {
    const platformDir = path.join(releaseLocalDir, platformName);
    if (!fs.existsSync(platformDir)) continue;

    const files = fs.readdirSync(platformDir);
    for (const file of files) {
      if (!file.endsWith('.sig')) continue;

      const sigFilePath = path.join(platformDir, file);
      let signature;
      try {
        signature = fs.readFileSync(sigFilePath, 'utf8').trim();
      } catch (_) {
        continue;
      }

      // We only consume genuine Tauri minisign signatures for the auto-updater
      if (!signature.includes('untrusted comment: signature from tauri secret key')) {
        continue;
      }

      let bundleFileName = file.replace(/\.sig$/, '');
      let bundleFilePath = path.join(platformDir, bundleFileName);

      // If the direct un-.sig filename doesn't exist, search for matching installer
      if (!fs.existsSync(bundleFilePath)) {
        if (platformName === 'windows') {
          const winInstaller = files.find(f =>
            !f.endsWith('.sig') && !f.endsWith('.pem') && !f.endsWith('.txt') &&
            (f.toLowerCase().includes('setup.exe') || f.toLowerCase().endsWith('.msi') || f.toLowerCase().endsWith('.nsis.zip')) &&
            !f.toLowerCase().includes('portable')
          );
          if (winInstaller) {
            bundleFileName = winInstaller;
            bundleFilePath = path.join(platformDir, bundleFileName);
          }
        } else if (platformName === 'linux') {
          const linuxInstaller = files.find(f =>
            !f.endsWith('.sig') && !f.endsWith('.pem') &&
            (f.toLowerCase().endsWith('.appimage') || f.toLowerCase().endsWith('.deb'))
          );
          if (linuxInstaller) {
            bundleFileName = linuxInstaller;
            bundleFilePath = path.join(platformDir, bundleFileName);
          }
        } else if (platformName === 'macos') {
          const macInstaller = files.find(f =>
            !f.endsWith('.sig') && !f.endsWith('.pem') &&
            (f.toLowerCase().endsWith('.tar.gz') || f.toLowerCase().endsWith('.dmg'))
          );
          if (macInstaller) {
            bundleFileName = macInstaller;
            bundleFilePath = path.join(platformDir, bundleFileName);
          }
        }
      }

      if (fs.existsSync(bundleFilePath)) {
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

  const manifestPath = path.join(updaterOutputDir, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✓ Updater manifest written to: ${path.relative(rootDir, manifestPath)}`);
  console.log(`  Target Version: v${version}`);
  console.log(`  Target Platforms Configured: ${Object.keys(manifest.platforms).join(', ') || 'None (Signatures pending build)'}`);
  console.log(`  Download Base URL: ${downloadBaseUrl}\n`);
}

generateManifest();
