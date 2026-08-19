const fs = require('fs');
const path = require('path');
const { normalizeVersion, readJson, pass, failExit: fail } = require('./release-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(repoRoot, 'package.json');
const tauriConfigPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(repoRoot, 'src-tauri', 'Cargo.toml');
const cargoLockPath = path.join(repoRoot, 'src-tauri', 'Cargo.lock');

function readCargoPackageVersion(file) {
  const contents = fs.readFileSync(file, 'utf8');
  const packageSection = contents.match(/\[package\]([\s\S]*?)(?:\n\[|$)/);
  if (!packageSection) return null;
  return packageSection[1].match(/(?:^|\n)version\s*=\s*"([^"]+)"/)?.[1] || null;
}

function readCargoLockPackageVersion(file, packageName) {
  const contents = fs.readFileSync(file, 'utf8');
  const packageSections = contents.split(/\n\[\[package\]\]\n/g);
  for (const section of packageSections) {
    const name = section.match(/(?:^|\n)name\s*=\s*"([^"]+)"/)?.[1];
    if (name !== packageName) continue;
    return section.match(/(?:^|\n)version\s*=\s*"([^"]+)"/)?.[1] || null;
  }
  return null;
}

const packageJson = readJson(packageJsonPath);
const tauriConfig = readJson(tauriConfigPath);
const packageVersion = packageJson.version;
const tauriVersion = tauriConfig.version;
const cargoTomlVersion = readCargoPackageVersion(cargoTomlPath);
const cargoLockVersion = readCargoLockPackageVersion(cargoLockPath, 'aegis-vault-v7');

const versions = [
  ['package.json', packageVersion],
  ['tauri.conf.json', tauriVersion],
  ['Cargo.toml', cargoTomlVersion],
  ['Cargo.lock', cargoLockVersion],
];

console.log('Desktop version consistency');
for (const [label, version] of versions) {
  console.log('  ' + label + ': ' + (version || '<missing>') + ' -> ' + normalizeVersion(version));
}

const missing = versions.filter(([, version]) => !version).map(([label]) => label);
if (missing.length > 0) {
  fail('missing version values: ' + missing.join(', '));
}

const normalized = versions.map(([label, version]) => [label, normalizeVersion(version)]);
const unique = new Set(normalized.map(([, version]) => version));
if (unique.size === 1) {
  pass('normalized desktop versions match (' + normalized[0][1] + ')');
} else {
  fail('normalized desktop versions differ: ' + normalized.map(([label, version]) => label + '=' + version).join(', '));
}

if (/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(packageVersion || '')) {
  pass('package.json version uses numeric release format');
} else {
  fail('package.json version must use numeric release format');
}
