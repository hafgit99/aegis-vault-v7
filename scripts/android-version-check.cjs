const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const tauriConfigPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
const androidPropertiesPath = path.join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'tauri.properties');

function normalizeVersion(version) {
  const parts = String(version || '')
    .trim()
    .split('.')
    .map((part) => Number.parseInt(part, 10));

  while (parts.length > 3 && parts[parts.length - 1] === 0) {
    parts.pop();
  }

  return parts.join('.');
}

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

function fail(message) {
  console.log(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

const packageVersion = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version;
const tauriVersion = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8')).version;
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
