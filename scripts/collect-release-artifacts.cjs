const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const targetDir = process.env.CARGO_TARGET_DIR
  ? path.resolve(process.env.CARGO_TARGET_DIR)
  : path.join(rootDir, 'src-tauri', 'target');
const releaseLocalDir = path.join(rootDir, 'release-local');
const packageJson = require(path.join(rootDir, 'package.json'));

const args = process.argv.slice(2);
const explicitPlatform = getArgValue('--platform');
const platform = explicitPlatform || detectPlatform();
const skipExtensions = args.includes('--skip-extensions');
const version = packageJson.version;
const outputDir = path.join(releaseLocalDir, platform);
const manualSmokeChecklistPath = path.join(rootDir, 'docs', 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md');

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
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      if (error.code === 'EBUSY' || error.code === 'EPERM') {
        for (const file of fs.readdirSync(dir)) {
          try {
            fs.rmSync(path.join(dir, file), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
          } catch (_e) {
            // Best effort removal for individual locked entries
          }
        }
      } else {
        throw error;
      }
    }
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyFile(source, fileName) {
  const destination = path.join(outputDir, fileName);
  fs.mkdirSync(path.dirname(destination), { recursive: true });

  const MAX_RETRIES = 5;
  const BASE_DELAY_MS = 500;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (fs.existsSync(destination)) {
        try {
          fs.unlinkSync(destination);
        } catch (_) {}
      }
      fs.copyFileSync(source, destination);
      return destination;
    } catch (error) {
      const isRetryable = error.code === 'EBUSY' || error.code === 'EPERM';
      if (isRetryable && attempt < MAX_RETRIES) {
        if (process.platform === 'win32' && attempt >= 1) {
          const destName = path.basename(destination);
          try {
            const { spawnSync } = require('child_process');
            spawnSync('taskkill', ['/F', '/IM', destName], { stdio: 'ignore' });
          } catch (_) {}
        }
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.log(`  ⏳ File locked (${error.code}), retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        const start = Date.now();
        while (Date.now() - start < delay) { /* busy-wait (sync context) */ }
      } else {
        throw error;
      }
    }
  }
}


function copyDirectory(source, dirName) {
  const destination = path.join(outputDir, dirName);
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
  return destination;
}

function newestMatch(predicate) {
  return allMatches(predicate)
    .filter(file => fs.existsSync(file))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
}

function allMatches(predicate) {
  return walk(targetDir).filter(predicate);
}

function normalizeName(kind, ext) {
  return `KalderaShield-${version}-${platform}-${kind}${ext}`;
}

/**
 * When this build started, as written by local-release.cjs right before
 * `tauri build`. Null when collect is run on its own, which is what CI does.
 */
function buildStartedAt() {
  const stampPath = path.join(targetDir, '.kalderashield-build-stamp');
  if (!fs.existsSync(stampPath)) return null;
  try {
    return fs.statSync(stampPath).mtimeMs;
  } catch (_) {
    return null;
  }
}

const buildStartMs = buildStartedAt();

/**
 * Refuses to package an installer that this build did not produce.
 *
 * The failure this guards against is silent by construction: an installer left
 * over from an earlier build carries the same version number, because the
 * version did not change -- only the code did -- so it passes every name-based
 * check and gets collected next to a freshly built artifact of another format.
 * The resulting release contains two different binaries under one version, and
 * nothing reports it, including the checksum file, which is rewritten from
 * whatever was collected.
 *
 * A partially failed build is how this happens in practice: bundling writes
 * the MSI, fails on the next step, and leaves the NSIS installer from the
 * previous run in place.
 *
 * Skipped when there is no stamp, because a bare `collect` on a CI runner has
 * no local build to compare against and refusing there would break the
 * pipeline. The bundle/ cleanup in local-release.cjs is what makes the stamp
 * authoritative in the first place.
 */
function staleBundledArtifacts(candidates) {
  if (buildStartMs === null) return [];
  return candidates.filter(file => {
    try {
      return fs.statSync(file).mtimeMs < buildStartMs;
    } catch (_) {
      return false;
    }
  });
}

function assertFreshBundledArtifacts(candidates, formatOf) {
  const stale = staleBundledArtifacts(candidates);
  if (stale.length === 0) return;

  const builtAt = fs.existsSync(path.join(targetDir, '.kalderashield-build-stamp'))
    ? fs.readFileSync(path.join(targetDir, '.kalderashield-build-stamp'), 'utf8').trim()
    : 'unknown';

  const details = stale
    .map(file => {
      const stats = fs.statSync(file);
      return `  - ${formatOf(file)}: ${path.relative(rootDir, file)} (built ${stats.mtime.toISOString()})`;
    })
    .join('\n');

  throw new Error(
    `Refusing to collect ${stale.length} bundled artifact(s) that predate this build ` +
    `(build started ${builtAt}). A partially failed bundling step leaves earlier installers ` +
    `behind, and they carry the same version string as the current build.\n${details}\n` +
    'Delete src-tauri/target/release/bundle and run the release again.'
  );
}

function collectWindows() {
  const artifacts = [];
  const releaseExe = path.join(targetDir, 'release', 'kalderashield.exe');
  const msi = newestMatch(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}msi${path.sep}`) && file.toLowerCase().endsWith('.msi'));
  const setup = newestMatch(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}nsis${path.sep}`) && file.toLowerCase().endsWith('.exe'));

  assertFreshBundledArtifacts([msi, setup].filter(Boolean), file => (file.toLowerCase().endsWith('.msi') ? 'MSI' : 'NSIS installer'));

  if (fs.existsSync(releaseExe)) {
    artifacts.push(copyFile(releaseExe, normalizeName('x64-portable', '.exe')));
  }
  if (msi) {
    const destName = normalizeName('x64', '.msi');
    artifacts.push(copyFile(msi, destName));
    const msiSig = `${msi}.sig`;
    if (fs.existsSync(msiSig)) {
      artifacts.push(copyFile(msiSig, `${destName}.sig`));
    }
  }
  if (setup) {
    const destName = normalizeName('x64-setup', '.exe');
    artifacts.push(copyFile(setup, destName));
    const setupSig = `${setup}.sig`;
    if (fs.existsSync(setupSig)) {
      artifacts.push(copyFile(setupSig, `${destName}.sig`));
    }
  }

  return artifacts;
}

function collectLinux() {
  const artifacts = [];
  const debs = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}deb${path.sep}`) && file.toLowerCase().endsWith('.deb'));
  const appImages = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}appimage${path.sep}`) && file.toLowerCase().endsWith('.appimage'));

  assertFreshBundledArtifacts([...debs, ...appImages], file => (file.toLowerCase().endsWith('.deb') ? 'deb' : 'AppImage'));

  for (const deb of debs) {
    const destName = normalizeName('amd64', '.deb');
    artifacts.push(copyFile(deb, destName));
    const debSig = `${deb}.sig`;
    if (fs.existsSync(debSig)) {
      artifacts.push(copyFile(debSig, `${destName}.sig`));
    }
  }
  for (const appImage of appImages) {
    const destName = normalizeName('x64', '.AppImage');
    artifacts.push(copyFile(appImage, destName));
    const appImageSig = `${appImage}.sig`;
    if (fs.existsSync(appImageSig)) {
      artifacts.push(copyFile(appImageSig, `${destName}.sig`));
    }
  }

  return artifacts;
}

function collectMacos() {
  const artifacts = [];
  const dmgs = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}dmg${path.sep}`) && file.toLowerCase().endsWith('.dmg'));
  const apps = allMatches(file => file.includes(`${path.sep}release${path.sep}bundle${path.sep}macos${path.sep}`) && file.toLowerCase().endsWith('.app'));

  assertFreshBundledArtifacts([...dmgs, ...apps], file => (file.toLowerCase().endsWith('.dmg') ? 'dmg' : 'app'));

  for (const dmg of dmgs) {
    const destName = normalizeName('universal', '.dmg');
    artifacts.push(copyFile(dmg, destName));
    const dmgSig = `${dmg}.sig`;
    if (fs.existsSync(dmgSig)) {
      artifacts.push(copyFile(dmgSig, `${destName}.sig`));
    }
  }
  for (const app of apps) {
    artifacts.push(copyDirectory(app, normalizeName('universal', '.app')));
  }

  return artifacts;
}

function copyBrowserExtensions() {
  const artifacts = [];
  const extensionRoot = path.join(outputDir, 'browser-extension');
  const chromiumDir = path.join(rootDir, 'dist-extension');
  const firefoxDir = path.join(rootDir, 'dist-extension-firefox');
  const safariDir = path.join(rootDir, 'dist-extension-safari');
  const signedFirefoxDir = path.join(releaseLocalDir, 'firefox');

  if (fs.existsSync(chromiumDir)) {
    fs.cpSync(chromiumDir, path.join(extensionRoot, 'chromium'), { recursive: true });
  }
  if (fs.existsSync(firefoxDir)) {
    fs.cpSync(firefoxDir, path.join(extensionRoot, 'firefox'), { recursive: true });
  }
  if (fs.existsSync(safariDir)) {
    fs.cpSync(safariDir, path.join(extensionRoot, 'safari'), { recursive: true });
  }
  if (fs.existsSync(signedFirefoxDir)) {
    const xpi = fs.readdirSync(signedFirefoxDir)
      .filter(file => file.toLowerCase().endsWith('.xpi'))
      .map(file => path.join(signedFirefoxDir, file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

    if (xpi) {
      // The filename used to be applied unconditionally, so an XPI built by
      // `npm run package:firefox:xpi` -- which is unsigned -- was published as
      // "-firefox-signed.xpi". Nothing downstream noticed: the signing report
      // classifies .xpi as not-applicable, because the signing it knows how to
      // check is Authenticode and codesign, neither of which applies here.
      //
      // That artifact is worse than useless. Firefox Release and Beta reject an
      // unsigned XPI outright, so the name promised something the file did not
      // have, and a user who installed it from the name either fell back to
      // signature-check-disabled ESR or concluded the extension was tampered
      // with. Unsigned extensions are also exactly what antivirus heuristic
      // engines flag hardest in a credential-handling product.
      const name = isAmoSigned(xpi)
        ? `KalderaShield-${version}-firefox-signed.xpi`
        : `KalderaShield-${version}-firefox-UNSIGNED.xpi`;

      if (!isAmoSigned(xpi)) {
        console.log(
          `  ⚠ ${path.basename(xpi)} carries no Mozilla signature. Publishing it as UNSIGNED.\n` +
          '    Run `npm run sign:firefox:xpi` with AMO credentials before distributing the extension.'
        );
      }

      artifacts.push(copyFile(xpi, name));
    }
  }

  return artifacts;
}

/**
 * Whether an XPI carries a Mozilla signature.
 *
 * AMO signs by writing `META-INF/mozilla.*` alongside `META-INF/manifest.mf`
 * into the package. Reading the zip's central directory is enough and avoids a
 * dependency: the archive does not have to be extracted or inflated to answer
 * the question, and the signature is presence-checked only -- verifying the RSA
 * chain is Firefox's job at install time, not ours.
 */
function isAmoSigned(xpiPath) {
  try {
    const buffer = fs.readFileSync(xpiPath);
    // Locate the end-of-central-directory record so the file count and entry
    // offsets can be walked. A zip file is small enough here to read whole.
    const view = buffer;
    let eocd = -1;
    for (let i = view.length - 22; i >= 0 && i >= view.length - 22 - 0xffff; i--) {
      if (view.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return false;

    const entryCount = view.readUInt16LE(eocd + 10);
    let pointer = view.readUInt32LE(eocd + 16);

    for (let i = 0; i < entryCount; i++) {
      if (pointer + 46 > view.length) return false;
      if (view.readUInt32LE(pointer) !== 0x02014b50) return false;

      const nameLength = view.readUInt16LE(pointer + 28);
      const extraLength = view.readUInt16LE(pointer + 30);
      const commentLength = view.readUInt16LE(pointer + 32);
      const name = view.toString('utf8', pointer + 46, pointer + 46 + nameLength);
      if (/^META-INF\/mozilla\.(rsa|sf)$/i.test(name)) return true;

      pointer += 46 + nameLength + extraLength + commentLength;
    }
    return false;
  } catch (_) {
    // A file we cannot parse is not a signed one. Treating an unreadable archive
    // as signed would defeat the entire point of the check.
    return false;
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function directoryStats(dir) {
  const files = walk(dir).filter(file => fs.existsSync(file) && fs.statSync(file).isFile());
  return {
    fileCount: files.length,
    sizeBytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
  };
}

function gitValue(args, fallback = '<unknown>') {
  try {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function describeArtifact(file) {
  const stats = fs.statSync(file);
  const isDirectory = stats.isDirectory();
  const dirStats = isDirectory ? directoryStats(file) : null;

  return {
    name: path.basename(file),
    path: path.relative(rootDir, file),
    type: isDirectory ? 'directory' : 'file',
    sizeBytes: isDirectory ? dirStats.sizeBytes : stats.size,
    fileCount: isDirectory ? dirStats.fileCount : 1,
    sha256: isDirectory ? null : sha256(file),
    modifiedAt: stats.mtime.toISOString(),
  };
}

function writeChecksums(artifacts) {
  const lines = artifacts
    .filter(file => fs.existsSync(file) && fs.statSync(file).isFile())
    .map(file => {
      return `${sha256(file)}  ${path.basename(file)}`;
    })
    .sort();

  fs.writeFileSync(path.join(outputDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`, 'utf8');
}

function completedManualChecklist(contents, metadata) {
  const buildType = metadata.artifacts.some((artifact) => artifact.name.toLowerCase().includes('setup') || artifact.name.toLowerCase().endsWith('.msi'))
    ? 'installer/package'
    : 'portable/package';
  const replacements = new Map([
    ['- Version:', '- Version: ' + metadata.version],
    ['- Commit:', '- Commit: ' + metadata.commit],
    ['- Platform:', '- Platform: ' + metadata.platform],
    ['- Build type:', '- Build type: ' + buildType],
    ['- Signed artifacts:', '- Signed artifacts: not verified by collect script'],
    ['- Date:', '- Date: ' + metadata.createdAt],
  ]);

  return contents
    .split(/\r?\n/)
    .map((line) => replacements.get(line) || line)
    .join('\n') + '\n';
}

function readAssetIntegrityEvidence() {
  const manifestPath = path.join(rootDir, 'dist', 'KalderaShield-integrity.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Production asset integrity manifest is missing. Run npm run build first.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (
    manifest.schemaVersion !== 1
    || manifest.algorithm !== 'SHA-256'
    || !/^[a-f0-9]{64}$/.test(manifest.rootSha256 || '')
    || !Array.isArray(manifest.assets)
    || manifest.assets.length === 0
  ) throw new Error('Production asset integrity manifest is invalid.');
  return {
    schemaVersion: manifest.schemaVersion,
    algorithm: manifest.algorithm,
    rootSha256: manifest.rootSha256,
    assetCount: manifest.assets.length,
  };
}
function writeReleaseMetadata(artifacts) {
  const dirtyStatus = gitValue(['status', '--short'], '');
  const metadata = {
    createdAt: new Date().toISOString(),
    packageName: packageJson.name,
    version,
    platform,
    hostPlatform: process.platform,
    node: process.version,
    commit: gitValue(['rev-parse', 'HEAD']),
    branch: gitValue(['branch', '--show-current']),
    dirty: Boolean(dirtyStatus),
    dirtyStatus,
    assetIntegrity: readAssetIntegrityEvidence(),
    artifacts: artifacts.map(describeArtifact),
  };

  fs.writeFileSync(path.join(outputDir, 'metadata.json'), JSON.stringify(metadata, null, 2) + '\n', 'utf8');
  const artifactLines = metadata.artifacts.map((artifact) => {
    const hash = artifact.sha256 ? ', sha256 ' + artifact.sha256 : '';
    return '- `' + artifact.name + '` (' + artifact.type + ', ' + artifact.sizeBytes + ' bytes' + hash + ')';
  });

  if (fs.existsSync(manualSmokeChecklistPath)) {
    fs.writeFileSync(
      path.join(outputDir, 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md'),
      completedManualChecklist(fs.readFileSync(manualSmokeChecklistPath, 'utf8'), metadata),
      'utf8',
    );
  }

  fs.writeFileSync(
    path.join(outputDir, 'README.md'),
    [
      '# KalderaShield Desktop Release Evidence',
      '',
      'Created: ' + metadata.createdAt,
      'Version: ' + metadata.version,
      'Platform: ' + metadata.platform,
      'Commit: ' + metadata.commit,
      'Branch: ' + metadata.branch,
      'Dirty working tree: ' + (metadata.dirty ? 'yes' : 'no'),
      'Asset integrity root: ' + metadata.assetIntegrity.rootSha256,
      '',
      '## Files',
      '',
      '- `metadata.json`: machine-readable release evidence.',
      '- `SHA256SUMS.txt`: SHA-256 checksums for file artifacts.',
      '- `DESKTOP_MANUAL_SMOKE_CHECKLIST.md`: manual QA checklist for this candidate.',
      '- Copied installers/packages' + (skipExtensions ? '' : ' and browser extension assets') + ' for this platform.',
      '',
      '## Artifacts',
      '',
      ...artifactLines,
      '',
    ].join('\n'),
    'utf8',
  );
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

if (!skipExtensions) {
  artifacts = artifacts.concat(copyBrowserExtensions());
}
writeChecksums(artifacts);
writeReleaseMetadata(artifacts);

if (artifacts.length === 0) {
  console.warn(`No ${platform} release artifacts were found under ${targetDir}`);
} else {
  console.log(`Collected ${artifacts.length} ${platform} release artifacts into ${outputDir}`);
}
