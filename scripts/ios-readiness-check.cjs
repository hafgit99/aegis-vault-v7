const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const strict = process.argv.includes('--strict');
const checks = [];

function commandExists(command, args = ['--version']) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' });
  return {
    ok: result.status === 0,
    output: [result.stdout, result.stderr].filter(Boolean).join('\n').trim(),
    error: result.error ? String(result.error) : '',
  };
}

function addCheck(id, ok, detail, required = true) {
  checks.push({ id, ok: Boolean(ok), detail, required });
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function rustTargetInstalled(target) {
  const result = spawnSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8', shell: process.platform === 'win32' });
  if (result.status !== 0) return { ok: false, detail: (result.stderr || result.error || 'rustup target list failed').toString().trim() };
  const installed = result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return { ok: installed.includes(target), detail: installed.includes(target) ? 'installed' : 'missing' };
}

const packageJson = readJson('package.json');
const tauriConf = readJson('src-tauri/tauri.conf.json');
const cargoToml = fs.readFileSync(path.join(repoRoot, 'src-tauri', 'Cargo.toml'), 'utf8');
const capabilities = fs.existsSync(path.join(repoRoot, 'src-tauri', 'capabilities', 'default.json'))
  ? fs.readFileSync(path.join(repoRoot, 'src-tauri', 'capabilities', 'default.json'), 'utf8')
  : '';

addCheck('host-macos', process.platform === 'darwin', process.platform === 'darwin' ? 'macOS host detected.' : `Current host is ${process.platform}; iOS build/init must run on macOS with full Xcode.`);

const xcodebuild = commandExists('xcodebuild', ['-version']);
addCheck('xcodebuild', xcodebuild.ok, xcodebuild.ok ? xcodebuild.output.split(/\r?\n/)[0] : 'xcodebuild not available. Install full Xcode, not only Command Line Tools.');

const xcodeSelect = commandExists('xcode-select', ['-p']);
addCheck('xcode-select', xcodeSelect.ok && /Xcode\.app/.test(xcodeSelect.output), xcodeSelect.ok ? xcodeSelect.output : 'xcode-select not available or not pointing at Xcode.app.');

for (const target of ['aarch64-apple-ios', 'aarch64-apple-ios-sim', 'x86_64-apple-ios']) {
  const result = rustTargetInstalled(target);
  addCheck(`rust-target-${target}`, result.ok, result.detail === 'installed' ? `${target} installed.` : `${target} missing. Run: rustup target add ${target}`);
}

const pod = commandExists('pod', ['--version']);
addCheck('cocoapods', pod.ok, pod.ok ? `CocoaPods ${pod.output.split(/\s+/)[0]}` : 'CocoaPods missing. Install on macOS with: brew install cocoapods');

addCheck('tauri-cli-ios-script', Boolean(packageJson.scripts && packageJson.scripts['ios:init'] && packageJson.scripts['ios:build']), 'package.json exposes ios:init and ios:build scripts.');
addCheck('bundle-identifier', /^com\.hafgit99\.aegisvault7$/.test(tauriConf.identifier), `Bundle identifier: ${tauriConf.identifier}`);
addCheck('biometric-plugin-js', Boolean(packageJson.dependencies && packageJson.dependencies['@tauri-apps/plugin-biometric']), '@tauri-apps/plugin-biometric dependency is present.');
addCheck('biometric-plugin-rust', /tauri-plugin-biometric/.test(cargoToml), 'tauri-plugin-biometric Rust crate is present.');
addCheck('biometric-capability', /biometric:default/.test(capabilities), 'biometric:default capability is present.');

const iosSigningVars = ['APPLE_API_ISSUER', 'APPLE_API_KEY', 'APPLE_API_KEY_PATH', 'IOS_CERTIFICATE', 'IOS_CERTIFICATE_PASSWORD', 'IOS_MOBILE_PROVISION'];
const hasAutomaticSigning = ['APPLE_API_ISSUER', 'APPLE_API_KEY', 'APPLE_API_KEY_PATH'].every((name) => Boolean(process.env[name]));
const hasManualSigning = ['IOS_CERTIFICATE', 'IOS_CERTIFICATE_PASSWORD', 'IOS_MOBILE_PROVISION'].every((name) => Boolean(process.env[name]));
addCheck('ios-signing-material', hasAutomaticSigning || hasManualSigning, hasAutomaticSigning ? 'App Store Connect automatic signing environment detected.' : hasManualSigning ? 'Manual iOS signing environment detected.' : `No complete iOS signing environment detected. Expected automatic (${iosSigningVars.slice(0, 3).join(', ')}) or manual (${iosSigningVars.slice(3).join(', ')}).`, false);

const passedRequired = checks.filter((check) => check.required).every((check) => check.ok);
const passedAll = checks.every((check) => check.ok);

console.log('Aegis Vault 7 iOS readiness check');
console.log(`Status: ${passedRequired ? 'PASS' : 'BLOCKED'}`);
console.log(`Host: ${process.platform}`);
console.log(`Required status: ${passedRequired ? 'PASS' : 'BLOCKED'}`);
console.log(`Full signing status: ${passedAll ? 'PASS' : 'REVIEW'}`);
console.log('');
for (const check of checks) {
  const status = check.ok ? 'PASS' : check.required ? 'BLOCKED' : 'WARN';
  console.log(`${status} ${check.id}: ${check.detail}`);
}
console.log('');
console.log('Next macOS commands:');
console.log('  rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios');
console.log('  brew install cocoapods');
console.log('  npm run ios:init');
console.log('  npm run ios:build');

if (strict && !passedRequired) process.exit(1);
