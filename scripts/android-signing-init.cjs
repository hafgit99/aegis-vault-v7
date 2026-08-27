const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const examplePath = path.join(repoRoot, 'docs', 'android-signing.env.example');

// Preferred: outside the repo and outside any cloud-synced (OneDrive etc.) folder.
const externalDir = path.join(os.homedir(), 'AegisVaultKeys');
const externalTarget = path.join(externalDir, 'android-signing.env');

// Legacy fallback: in-repo .secrets folder.
const legacyDir = path.join(repoRoot, '.secrets');
const legacyTarget = path.join(legacyDir, 'android-signing.env');

function relative(file) {
  return path.relative(repoRoot, file) || '.';
}

if (!fs.existsSync(examplePath)) {
  console.error('Missing template: ' + relative(examplePath));
  process.exit(1);
}

if (fs.existsSync(externalTarget)) {
  console.log('Android signing env already exists: ' + externalTarget);
  console.log('No changes made. Edit it locally or delete it before reinitializing.');
  process.exit(0);
}

if (fs.existsSync(legacyTarget)) {
  console.log('Legacy in-repo signing env found: ' + relative(legacyTarget));
  console.log('Recommended: move it outside cloud-synced folders, e.g. to ' + externalTarget);
  console.log('No changes made.');
  process.exit(0);
}

fs.mkdirSync(externalDir, { recursive: true });
fs.copyFileSync(examplePath, externalTarget);
try {
  require('child_process').execFileSync('icacls', [externalTarget, '/inheritance:r', '/grant:r', `${process.env.USERNAME || process.env.USER}:F`], { stdio: 'ignore' });
} catch {
  // ACL hardening is best-effort; Unix users can chmod 600 instead.
}
console.log('Created local Android signing env: ' + externalTarget);
console.log('Fill the four AEGIS_ANDROID_* values, then run: npm run android:release:signing:check');
console.log('Keep this file outside cloud-synced folders (OneDrive, Drive, Dropbox).');
