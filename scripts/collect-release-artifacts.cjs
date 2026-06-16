const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const targetDir = path.join(rootDir, 'src-tauri', 'target');
const releaseLocalDir = path.join(rootDir, 'release-local');
const packageJson = require(path.join(rootDir, 'package.json'));

const args = process.argv.slice(2);
const explicitPlatform = getArgValue('--platform');
const platform = explicitPlatform || detectPlatform();
const version = packageJson.version;
const outputDir = path.join(releaseLocalDir, platform);

function getArgValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function detectPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.extname(fullPath).toLowerCase() === '.app') {
        files.push(fullPath);
      } else {
        walk(fullPath, files);
      }
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(source, fileName) {
  const destination = path.join(outputDir, fileName);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  return destination;
}

function copyDirectory(source, dirName) {
  const destination = path.join(outputDir, dirName);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
  return destination;
}

function firstMatch(predicate) {
  return walk(targetDir).find(predicate) || null;
}

function allMatches(predicate) {
  return walk(targetDir).filter(predicate);
}

function normalizeName(kind, ext) {
  return `AegisVault7-${version}-${platform}-${kind}${ext}`;
}

function collectWindows() {
  const artifacts = [];
  const releaseExe = path.join(targetDir, 'release', 'aegis-vault-v7.exe');
  const msi = firstMatch(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}msi${path.sep}`) && file.toLowerCase().endsWith('.msi'));
  const setup = firstMatch(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}nsis${path.sep}`) && file.toLowerCase().endsWith('.exe'));

  if (fs.existsSync(releaseExe)) {
    artifacts.push(copyFile(releaseExe, normalizeName('x64-portable', '.exe')));
  }
  if (msi) {
    artifacts.push(copyFile(msi, normalizeName('x64', '.msi')));
  }
  if (setup) {
    artifacts.push(copyFile(setup, normalizeName('x64-setup', '.exe')));
  }

  return artifacts;
}

function collectLinux() {
  const artifacts = [];
  const debs = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}deb${path.sep}`) && file.toLowerCase().endsWith('.deb'));
  const appImages = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}appimage${path.sep}`) && file.toLowerCase().endsWith('.appimage'));

  for (const deb of debs) {
    artifacts.push(copyFile(deb, normalizeName('amd64', '.deb')));
  }
  for (const appImage of appImages) {
    artifacts.push(copyFile(appImage, normalizeName('x64', '.AppImage')));
  }

  return artifacts;
}

function collectMacos() {
  const artifacts = [];
  const dmgs = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}dmg${path.sep}`) && file.toLowerCase().endsWith('.dmg'));
  const apps = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}macos${path.sep}`) && file.toLowerCase().endsWith('.app'));

  for (const dmg of dmgs) {
    artifacts.push(copyFile(dmg, normalizeName('universal', '.dmg')));
  }
  for (const app of apps) {
    copyDirectory(app, normalizeName('universal', '.app'));
  }

  return artifacts;
}

function copyBrowserExtensions() {
  const artifacts = [];
  const extensionRoot = path.join(outputDir, 'browser-extension');
  const chromiumDir = path.join(rootDir, 'dist-extension');
  const firefoxDir = path.join(rootDir, 'dist-extension-firefox');
  const signedFirefoxDir = path.join(releaseLocalDir, 'firefox');

  if (fs.existsSync(chromiumDir)) {
    fs.cpSync(chromiumDir, path.join(extensionRoot, 'chromium'), { recursive: true });
  }
  if (fs.existsSync(firefoxDir)) {
    fs.cpSync(firefoxDir, path.join(extensionRoot, 'firefox'), { recursive: true });
  }
  if (fs.existsSync(signedFirefoxDir)) {
    const xpi = fs.readdirSync(signedFirefoxDir)
      .filter(file => file.toLowerCase().endsWith('.xpi'))
      .map(file => path.join(signedFirefoxDir, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

    if (xpi) {
      artifacts.push(copyFile(xpi, `AegisVault7-${version}-firefox-signed.xpi`));
    }
  }

  return artifacts;
}

function writeChecksums(artifacts) {
  const lines = artifacts
    .filter(file => fs.existsSync(file) && fs.statSync(file).isFile())
    .map(file => {
      const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      return `${hash}  ${path.basename(file)}`;
    })
    .sort();

  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8');
}

ensureCleanDir(outputDir);

let artifacts = [];
if (platform === 'windows') {
  artifacts = collectWindows();
} else if (platform === 'linux') {
  artifacts = collectLinux();
} else if (platform === 'macos') {
  artifacts = collectMacos();
} else {
  throw new Error(`Unsupported platform: ${platform}`);
}

artifacts = artifacts.concat(copyBrowserExtensions());
writeChecksums(artifacts);

if (artifacts.length === 0) {
  console.warn(`No ${platform} release artifacts were found under ${targetDir}`);
} else {
  console.log(`Collected ${artifacts.length} ${platform} release artifacts into ${outputDir}`);
}
