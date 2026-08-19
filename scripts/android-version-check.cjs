const fs = require('fs');
const path = require('path');
const { normalizeVersion, readJson, pass, failExit: fail } = require('./release-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const tauriConfigPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
const androidPropertiesPath = path.join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'tauri.properties');

function readProperties(file) {
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

const packageVersion = readJson(packageJsonPath).version;
const tauriVersion = readJson(tauriConfigPath).version;
const androidProperties = readProperties(androidPropertiesPath);
const androidVersionName = androidProperties['tauri.android.versionName'];
const androidVersionCode = androidProperties['tauri.android.versionCode'];

const normalizedPackageVersion = normalizeVersion(packageVersion);
const normalizedTauriVersion = normalizeVersion(tauriVersion);
const normalizedAndroidVersion = normalizeVersion(androidVersionName);

console.log('Android version consistency');
console.log(`  package.json: ${packageVersion}`);
console.log(`  tauri.conf.json: ${tauriVersion}`);
console.log(`  tauri.android.versionName: ${androidVersionName}`);
console.log(`  tauri.android.versionCode: ${androidVersionCode}`);

if (normalizedPackageVersion === normalizedTauriVersion && normalizedTauriVersion === normalizedAndroidVersion) {
  pass(`normalized versions match (${normalizedTauriVersion})`);
} else {
  fail(`normalized versions differ: package=${normalizedPackageVersion}, tauri=${normalizedTauriVersion}, android=${normalizedAndroidVersion}`);
}

if (/^\d+$/.test(androidVersionCode || '') && Number(androidVersionCode) > 0) {
  pass('android versionCode is a positive integer');
} else {
  fail('android versionCode must be a positive integer');
}
