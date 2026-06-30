const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const explicitDir = getArgValue('--dir');
const releaseRoot = path.join(repoRoot, 'release-local', 'android');
const evidenceDir = explicitDir ? path.resolve(repoRoot, explicitDir) : findLatestEvidenceDir();
const allowDirty = hasFlag('--allow-dirty');
const requireDevice = hasFlag('--require-device');
const requireFreshInstall = hasFlag('--require-fresh-install');
const requireSigned = hasFlag('--require-signed');

function hasFlag(flag) {
  return args.includes(flag);
}

function getArgValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function usage() {
  return [
    'Android release evidence verifier',
    '',
    'Usage:',
    '  npm run android:release:evidence:verify -- [options]',
    '',
    'Options:',
    '  --dir <path>              Evidence directory. Defaults to latest release-local/android/* folder.',
    '  --allow-dirty             Permit metadata.json dirty=true for internal diagnostics.',
    '  --require-device          Fail unless device evidence files are present.',
    '  --require-fresh-install   Fail unless metadata records freshInstall=true.',
    '  --require-signed          Fail unless metadata records signed=true.',
    '  --help                    Show this help.',
  ].join('\n');
}

function fail(message) {
  throw new Error(message);
}

function findLatestEvidenceDir() {
  if (!fs.existsSync(releaseRoot)) {
    return path.join(releaseRoot, '<missing>');
  }

  const dirs = fs.readdirSync(releaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(releaseRoot, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return dirs[0] || path.join(releaseRoot, '<missing>');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    fail('Failed to read JSON file ' + file + ': ' + (error && error.message ? error.message : String(error)));
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readChecksumFile(file) {
  const entries = new Map();
  const contents = fs.readFileSync(file, 'utf8').trim();
  if (!contents) return entries;

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    if (!match) fail('Invalid checksum line: ' + line);
    entries.set(match[2].replaceAll('/', path.sep), match[1].toLowerCase());
  }

  return entries;
}

function ensureInsideEvidence(relativePath) {
  const fullPath = path.resolve(repoRoot, relativePath);
  const relativeToEvidence = path.relative(evidenceDir, fullPath);
  if (relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) {
    fail('Artifact path escapes evidence directory: ' + relativePath);
  }
  return fullPath;
}

function verifyChecklist(file, metadata) {
  const contents = fs.readFileSync(file, 'utf8');
  for (const expected of [
    '- Commit: ' + metadata.commit,
    '- Fresh install used: ' + (metadata.freshInstall ? 'yes' : 'no'),
    '- Build type: ' + (metadata.signed ? 'signed release APK' : 'debug APK'),
  ]) {
    if (!contents.includes(expected)) {
      fail('ANDROID_MANUAL_SMOKE_CHECKLIST.md is not prefilled with: ' + expected);
    }
  }
}

function verifyReport(file, metadata) {
  const contents = fs.readFileSync(file, 'utf8');
  for (const expected of ['Android release artifact report', 'Mode:', 'version:']) {
    if (!contents.includes(expected)) {
      fail('android-release-report.txt is missing expected context: ' + expected);
    }
  }
  if (metadata.signed && !contents.includes('Mode: release candidate artifacts only')) {
    fail('Signed metadata requires a release artifact report.');
  }
}

function verifyDeviceEvidence(metadata) {
  const doctorPath = path.join(evidenceDir, 'android-device-doctor.txt');
  const securityPath = path.join(evidenceDir, 'android-device-security.txt');
  if (metadata.deviceEvidence || requireDevice) {
    for (const file of [doctorPath, securityPath]) {
      if (!fs.existsSync(file)) {
        fail('Required Android device evidence file is missing: ' + path.relative(repoRoot, file));
      }
    }
    const doctor = fs.readFileSync(doctorPath, 'utf8');
    const security = fs.readFileSync(securityPath, 'utf8');
    if (!doctor.includes('Android device doctor')) fail('android-device-doctor.txt does not look like a device doctor report.');
    if (!security.includes('Android device security doctor')) fail('android-device-security.txt does not look like a device security report.');
  }
}

function verifyEvidence() {
  if (hasFlag('--help')) {
    console.log(usage());
    return;
  }

  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    fail('Android release evidence directory not found: ' + evidenceDir);
  }

  const metadataPath = path.join(evidenceDir, 'metadata.json');
  const checksumsPath = path.join(evidenceDir, 'SHA256SUMS.txt');
  const reportPath = path.join(evidenceDir, 'android-release-report.txt');
  const readmePath = path.join(evidenceDir, 'README.md');
  const checklistPath = path.join(evidenceDir, 'ANDROID_MANUAL_SMOKE_CHECKLIST.md');

  for (const file of [metadataPath, checksumsPath, reportPath, readmePath, checklistPath]) {
    if (!fs.existsSync(file)) fail('Required Android release evidence file is missing: ' + path.relative(repoRoot, file));
  }

  const metadata = readJson(metadataPath);
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];
  if (metadata.dirty && !allowDirty) {
    fail('Refusing Android release evidence from a dirty working tree. Use --allow-dirty only for internal diagnostics.');
  }
  if (requireDevice && !metadata.deviceEvidence) fail('Device evidence is required but metadata.deviceEvidence is false.');
  if (requireFreshInstall && !metadata.freshInstall) fail('Fresh install evidence is required but metadata.freshInstall is false.');
  if (requireSigned && !metadata.signed) fail('Signed release evidence is required but metadata.signed is false.');
  if (artifacts.length === 0) fail('metadata.json contains no copied Android artifacts.');

  const checksumEntries = readChecksumFile(checksumsPath);
  const artifactNames = new Set();
  for (const artifact of artifacts) {
    if (!artifact.copied || !artifact.sha256) fail('Android artifact metadata is missing copied path or sha256.');
    const artifactPath = ensureInsideEvidence(artifact.copied);
    if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) {
      fail('Copied Android artifact is missing: ' + artifact.copied);
    }
    const actualHash = sha256(artifactPath);
    if (artifact.sha256 !== actualHash) fail('metadata.json sha256 mismatch for ' + artifact.copied);
    if (artifact.sizeBytes !== fs.statSync(artifactPath).size) fail('metadata.json size mismatch for ' + artifact.copied);
    const checksumHash = checksumEntries.get(artifact.copied.replaceAll('/', path.sep));
    if (!checksumHash) fail('SHA256SUMS.txt is missing artifact: ' + artifact.copied);
    if (checksumHash !== actualHash) fail('SHA256SUMS.txt sha256 mismatch for ' + artifact.copied);
    artifactNames.add(artifact.copied.replaceAll('/', path.sep));
  }

  for (const name of checksumEntries.keys()) {
    if (!artifactNames.has(name)) fail('SHA256SUMS.txt contains an entry not present in metadata.json: ' + name);
  }

  verifyReport(reportPath, metadata);
  verifyChecklist(checklistPath, metadata);
  verifyDeviceEvidence(metadata);

  console.log('Android release evidence verified: ' + path.relative(repoRoot, evidenceDir));
  console.log('Artifacts: ' + artifacts.length);
  console.log('Device evidence: ' + (metadata.deviceEvidence ? 'yes' : 'no'));
  console.log('Fresh install: ' + (metadata.freshInstall ? 'yes' : 'no'));
  console.log('Signed: ' + (metadata.signed ? 'yes' : 'no'));
}

verifyEvidence();
