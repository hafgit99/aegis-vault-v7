const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, 'src-tauri', 'target');
const releaseDir = path.join(rootDir, 'release-local');

const platform = process.platform;
const args = process.argv.slice(2);
const skipTests = args.includes('--skip-tests');
const macUniversal = args.includes('--mac-universal');

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (path.extname(fullPath).toLowerCase() !== '.app') {
        walk(fullPath, files);
      } else {
        files.push(fullPath);
      }
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function isReleaseArtifact(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const ext = path.extname(filePath).toLowerCase();

  if (normalized.includes('/release/deps/') || normalized.includes('/release/build/')) {
    return false;
  }

  if (normalized.endsWith('/target/SHA256SUMS.txt')) {
    return true;
  }

  if (ext === '.app') return normalized.includes('/release/bundle/macos/');

  return ['.exe', '.msi', '.dmg', '.deb', '.appimage'].includes(ext)
    && normalized.includes('/release/');
}

function copyArtifacts() {
  const platformName = platform === 'win32'
    ? 'windows'
    : platform === 'darwin'
      ? 'macos'
      : 'linux';
  const destination = path.join(releaseDir, platformName);
  ensureCleanDir(destination);

  const artifacts = walk(targetDir).filter(isReleaseArtifact);
  for (const artifact of artifacts) {
    const relative = path.relative(targetDir, artifact);
    const outputPath = path.join(destination, relative);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    if (fs.statSync(artifact).isDirectory()) {
      fs.cpSync(artifact, outputPath, { recursive: true });
    } else {
      fs.copyFileSync(artifact, outputPath);
    }
  }

  if (fs.existsSync(path.join(rootDir, 'dist-extension'))) {
    fs.cpSync(path.join(rootDir, 'dist-extension'), path.join(destination, 'browser-extension', 'chromium'), { recursive: true });
  }

  if (fs.existsSync(path.join(rootDir, 'dist-extension-firefox'))) {
    fs.cpSync(path.join(rootDir, 'dist-extension-firefox'), path.join(destination, 'browser-extension', 'firefox'), { recursive: true });
  }

  console.log(`\nLocal release artifacts copied to: ${destination}`);
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
  run('npm', ['run', 'test:unit']);
}

run('npm', ['run', 'build:extension']);

const tauriArgs = ['tauri', 'build'];
if (platform === 'darwin' && macUniversal) {
  tauriArgs.push('--target', 'universal-apple-darwin');
}
run('npx', tauriArgs);

run('node', ['scripts/generate-checksums.cjs']);
copyArtifacts();
