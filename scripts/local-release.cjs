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

const tauriArgs = ['tauri', 'build'];
if (platform === 'darwin' && macUniversal) {
  tauriArgs.push('--target', 'universal-apple-darwin');
}
run('npx', tauriArgs);
run('npm', ['run', 'security:release-hardening']);

const platformName = platform === 'win32'
  ? 'windows'
  : platform === 'darwin'
    ? 'macos'
    : 'linux';
run('node', ['scripts/collect-release-artifacts.cjs', '--platform', platformName]);
