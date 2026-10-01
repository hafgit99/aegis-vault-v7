const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const platform = process.platform;
const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const macUniversal = args.includes('--mac-universal');

const fs = require('fs');

const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');

function run(command, commandArgs, options = {}) {
  let executable = command;
  let args = commandArgs;

  if (command === 'npm') {
    if (fs.existsSync(npmCli)) {
      executable = process.execPath;
      args = [npmCli, ...commandArgs];
    } else {
      executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    }
  } else if (command === 'npx') {
    if (fs.existsSync(npxCli)) {
      executable = process.execPath;
      args = [npxCli, ...commandArgs];
    } else {
      executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    }
  } else if (command === 'node') {
    executable = process.execPath;
    args = commandArgs;
  } else if (command === 'cargo' && process.platform === 'win32') {
    executable = 'cargo.exe';
  } else if (command === 'rustup' && process.platform === 'win32') {
    executable = 'rustup.exe';
  }

  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(executable, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: !fs.existsSync(npmCli) && process.platform === 'win32' && (command === 'npm' || command === 'npx'),
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function printPlatformNote() {
  if (platform === 'win32') {
    console.log('Building Windows artifacts on Windows.');
    console.log('Linux and macOS bundles must be built on Linux/macOS hosts or VMs.');
  } else if (platform === 'darwin') {
    console.log(macUniversal
      ? 'Building macOS universal artifacts.'
      : 'Building macOS artifacts for the current architecture.');
  } else {
    console.log('Building Linux artifacts on Linux.');
  }
}

printPlatformNote();

if (!skipTests) {
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'rust:fmt:check']);
  run('npm', ['run', 'rust:test:native']);
  run('npm', ['run', 'security:dependencies']);
  run('npm', ['run', 'test:unit']);
  run('npm', ['run', 'test:fuzz']);
}

run('npm', ['run', 'build:extension']);

/**
 * `tauri build` does not clear bundle/, it only adds to it. An installer from
 * an earlier version therefore survives the next build and keeps the same
 * version string in its own filename, because the version did not change --
 * only the code did. Nothing downstream could tell the two apart by name, and
 * release:collect picks the newest match per format, so a release could ship
 * today's MSI next to last month's NSIS installer: two payloads, one version
 * number, no error anywhere.
 *
 * Deleting the directory first is the only thing that makes "the artifact in
 * release-local is the one this build produced" true by construction.
 */
const cargoTargetDir = process.env.CARGO_TARGET_DIR
  ? path.resolve(process.env.CARGO_TARGET_DIR)
  : path.join(rootDir, 'src-tauri', 'target');
const bundleDir = path.join(cargoTargetDir, 'release', 'bundle');

if (fs.existsSync(bundleDir)) {
  console.log(`\n> clean ${path.relative(rootDir, bundleDir)}`);
  fs.rmSync(bundleDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/**
 * Written before the build and read back by collect-release-artifacts.cjs.
 *
 * Comparing an artifact against the bundled executable does not work on its
 * own: an antivirus that quarantines and restores that executable rewrites its
 * mtime, so a perfectly good installer ends up looking older than the binary it
 * contains. The stamp sits outside bundle/ and is never touched by antivirus
 * remediation, so it records when the build actually started.
 */
const buildStampPath = path.join(cargoTargetDir, '.kalderashield-build-stamp');
fs.mkdirSync(cargoTargetDir, { recursive: true });
fs.writeFileSync(buildStampPath, new Date().toISOString());
console.log(`> build stamp ${new Date().toISOString()}`);

const tauriArgs = ['tauri', 'build'];
if (platform === 'darwin' && macUniversal) {
  tauriArgs.push('--target', 'universal-apple-darwin');
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
  tauriArgs.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
}
run('npx', tauriArgs);
run('npm', ['run', 'security:release-hardening']);

const platformName = platform === 'win32'
  ? 'windows'
  : platform === 'darwin'
    ? 'macos'
    : 'linux';
run('node', ['scripts/collect-release-artifacts.cjs', '--platform', platformName]);
