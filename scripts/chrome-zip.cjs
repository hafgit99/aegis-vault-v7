const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const chromeDistDir = path.join(rootDir, 'dist-extension');
const stagingDir = path.join(rootDir, '.tmp', 'chrome-zip');
const artifactsDir = path.join(rootDir, 'release-local', 'chrome');
const edgeArtifactsDir = path.join(rootDir, 'release-local', 'edge');
const packageJson = require(path.join(rootDir, 'package.json'));

const args = new Set(process.argv.slice(2));
const skipBuild = args.has('--skip-build');
const zipName = `aegis-vault-7-chrome-v${packageJson.version}.zip`;
const edgeZipName = `aegis-vault-7-edge-v${packageJson.version}.zip`;

const excludedNames = new Set([
  'aegis-host.bat',
  'com.hafgit99.aegisvault7.json',
  'chromium-extension.rar',
]);

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

function copyCleanExtension(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludedNames.has(entry.name) || entry.name.endsWith('.map') || entry.name.endsWith('.rar')) continue;

    const sourcePath = path.join(src, entry.name);
    const destinationPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyCleanExtension(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function assertChromeManifest() {
  const manifestPath = path.join(stagingDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  if (manifest.manifest_version !== 3) {
    throw new Error('Chrome manifest must be manifest_version 3');
  }

  if (!manifest.background?.service_worker) {
    throw new Error('Chrome MV3 build must use background.service_worker');
  }
}

function createZip(sourceDirectory, destinationZipPath) {
  if (process.platform === 'win32') {
    // Windows: prefer AdmZip; fall back to PowerShell Compress-Archive
    let AdmZip;
    try {
      AdmZip = require('adm-zip');
    } catch {
      // fallback if AdmZip not found directly
    }

    if (AdmZip) {
      const zip = new AdmZip();
      zip.addLocalFolder(sourceDirectory, '');
      zip.writeZip(destinationZipPath);
      return;
    }

    // PowerShell Compress-Archive fallback with safe parameter passing
    const psScript = `
      param($src, $dst)
      Compress-Archive -Path (Join-Path $src '*') -DestinationPath $dst -Force
    `;
    const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript, sourceDirectory, destinationZipPath], { stdio: 'inherit' });
    if (res.status !== 0) {
      throw new Error(`Failed to create zip archive with PowerShell: ${destinationZipPath}`);
    }
    return;
  }

  // Linux/macOS: use the system `zip` CLI (available on GitHub runners and standard Unix systems)
  const zipDir = path.dirname(destinationZipPath);
  fs.mkdirSync(zipDir, { recursive: true });
  const res = spawnSync('zip', ['-r', '-X', destinationZipPath, '.'], { cwd: sourceDirectory, stdio: 'inherit' });
  if (res.status !== 0 || (res.error && typeof res.error === 'object')) {
    throw new Error(`Failed to create zip archive with zip CLI (is 'zip' installed?): ${destinationZipPath}`);
  }
}

if (!skipBuild) {
  run('npm', ['run', 'build:extension']);
}

if (!fs.existsSync(chromeDistDir)) {
  throw new Error('dist-extension does not exist. Run npm run build:extension first.');
}

fs.mkdirSync(artifactsDir, { recursive: true });
fs.mkdirSync(edgeArtifactsDir, { recursive: true });

copyCleanExtension(chromeDistDir, stagingDir);
assertChromeManifest();

const chromeZipPath = path.join(artifactsDir, zipName);
const edgeZipPath = path.join(edgeArtifactsDir, edgeZipName);

if (fs.existsSync(chromeZipPath)) fs.unlinkSync(chromeZipPath);
if (fs.existsSync(edgeZipPath)) fs.unlinkSync(edgeZipPath);

createZip(stagingDir, chromeZipPath);
fs.copyFileSync(chromeZipPath, edgeZipPath);

console.log(`\nChrome Web Store package ready: ${chromeZipPath}`);
console.log(`Microsoft Edge Addons package ready: ${edgeZipPath}`);
