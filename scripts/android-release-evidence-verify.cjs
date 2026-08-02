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
const requireCompletedChecklist = hasFlag('--require-completed-checklist');
const requireBiometricMatrix = hasFlag('--require-biometric-matrix');

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
    '  --require-completed-checklist',
    '                            Fail unless the manual smoke checklist is completed.',
    '  --require-biometric-matrix',
    '                            Fail unless Android biometric production approval matrix is complete.',
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

function verifyCompletedChecklist(file) {
  const contents = fs.readFileSync(file, 'utf8');
  const requiredFields = [
    '- Version:',
    '- Commit:',
    '- Device model:',
    '- Android version / SDK:',
    '- Build type:',
    '- Fresh install used:',
    '- Tester:',
    '- Date:',
  ];

  for (const label of requiredFields) {
    const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(label));
    if (!line || line.slice(label.length).trim().length === 0) {
      fail('ANDROID_MANUAL_SMOKE_CHECKLIST.md is missing a completed candidate field: ' + label);
    }
  }

  const unchecked = contents.split(/\r?\n/).filter((line) => /^- \[ \]/.test(line));
  if (unchecked.length > 0) {
    fail('ANDROID_MANUAL_SMOKE_CHECKLIST.md has unchecked release items: ' + unchecked.slice(0, 5).join(' | '));
  }

  const checkedCount = contents.split(/\r?\n/).filter((line) => /^- \[x\]/i.test(line)).length;
  if (checkedCount === 0) {
    fail('ANDROID_MANUAL_SMOKE_CHECKLIST.md does not contain any completed checklist items.');
  }
}

function checklistField(contents, label) {
  const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(label));
  return line ? line.slice(label.length).trim() : '';
}

function isPlaceholderValue(value) {
  return !value || /^(blocked|n\/?a|na|none|tbd|todo|pending|-|<.*>)$/i.test(value.trim());
}

function verifyBiometricMatrix(file) {
  const contents = fs.readFileSync(file, 'utf8');
  const status = checklistField(contents, '- Biometric production claim status:');
  if (!/^approved$/i.test(status)) {
    fail('Android biometric production claim is not approved. Set "Biometric production claim status" to approved only after the matrix passes.');
  }

  const requiredFields = [
    '- Biometric matrix reviewer:',
    '- Biometric matrix completed date:',
    '- Pixel evidence:',
    '- Samsung evidence:',
    '- Xiaomi evidence:',
    '- Android 12 evidence:',
    '- Android 13 evidence:',
    '- Android 14 evidence:',
    '- Android 15 evidence:',
  ];

  for (const label of requiredFields) {
    const value = checklistField(contents, label);
    if (isPlaceholderValue(value)) {
      fail('Android biometric production matrix is missing completed evidence field: ' + label);
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
  if (
    metadata.assetIntegrity?.schemaVersion !== 1
    || metadata.assetIntegrity?.algorithm !== 'SHA-256'
    || !/^[a-f0-9]{64}$/.test(metadata.assetIntegrity?.rootSha256 || '')
    || !Number.isSafeInteger(metadata.assetIntegrity?.assetCount)
    || metadata.assetIntegrity.assetCount <= 0
  ) {
    fail('metadata.json assetIntegrity evidence is invalid or missing.');
  }
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
  if (requireCompletedChecklist) verifyCompletedChecklist(checklistPath);
  if (requireBiometricMatrix) verifyBiometricMatrix(checklistPath);
  verifyDeviceEvidence(metadata);

  console.log('Android release evidence verified: ' + path.relative(repoRoot, evidenceDir));
  console.log('Asset integrity root: ' + metadata.assetIntegrity.rootSha256);
  console.log('Artifacts: ' + artifacts.length);
  console.log('Device evidence: ' + (metadata.deviceEvidence ? 'yes' : 'no'));
  console.log('Fresh install: ' + (metadata.freshInstall ? 'yes' : 'no'));
  console.log('Signed: ' + (metadata.signed ? 'yes' : 'no'));
  console.log('Completed checklist required: ' + (requireCompletedChecklist ? 'yes' : 'no'));
  console.log('Biometric production matrix required: ' + (requireBiometricMatrix ? 'yes' : 'no'));
}

verifyEvidence();
