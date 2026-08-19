const fs = require('fs');
const path = require('path');
const {
  hasFlag,
  getArgValue,
  readJsonSafe,
  sha256,
  formatBool,
  readChecksumFile,
  checklistStats,
  checklistField,
  isPlaceholderValue,
} = require('./release-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const explicitDir = getArgValue(args, '--dir');
const finalMode = hasFlag(args, '--final');
const allowDirty = hasFlag(args, '--allow-dirty');
const requireBiometricMatrix = hasFlag(args, '--require-biometric-matrix') || finalMode;
const releaseRoot = path.join(repoRoot, 'release-local', 'android');
const evidenceDir = explicitDir ? path.resolve(repoRoot, explicitDir) : findLatestEvidenceDir();

function usage() {
  return [
    'Android release evidence summary',
    '',
    'Usage:',
    '  npm run android:release:evidence:summary -- [options]',
    '',
    'Options:',
    '  --dir <path>     Evidence directory. Defaults to latest release-local/android/* folder.',
    '  --final          Require signed, device, fresh-install, completed checklist, and biometric matrix evidence.',
    '  --allow-dirty    Permit dirty evidence for internal diagnostics.',
    '  --require-biometric-matrix',
    '                   Require Android biometric production approval matrix.',
    '  --help           Show this help.',
  ].join('\n');
}

function findLatestEvidenceDir() {
  if (!fs.existsSync(releaseRoot)) return path.join(releaseRoot, '<missing>');
  const dirs = fs.readdirSync(releaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(releaseRoot, entry.name))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return dirs[0] || path.join(releaseRoot, '<missing>');
}

const ANDROID_CHECKLIST_FIELDS = [
  '- Version:',
  '- Commit:',
  '- Device model:',
  '- Android version / SDK:',
  '- Build type:',
  '- Fresh install used:',
  '- Tester:',
  '- Date:',
];

function biometricMatrixStats(file) {
  if (!fs.existsSync(file)) return { approved: false, missing: ['<checklist missing>'] };
  const contents = fs.readFileSync(file, 'utf8');
  const status = checklistField(contents, '- Biometric production claim status:');
  const fields = [
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
  const missing = fields.filter((label) => isPlaceholderValue(checklistField(contents, label)));
  if (!/^approved$/i.test(status)) missing.unshift('- Biometric production claim status: approved');
  return { approved: missing.length === 0, missing };
}

function verifyEvidence(metadata, artifacts, stats, biometricStats) {
  const issues = [];
  const requiredFiles = ['metadata.json', 'SHA256SUMS.txt', 'android-release-report.txt', 'README.md', 'ANDROID_MANUAL_SMOKE_CHECKLIST.md'];
  for (const file of requiredFiles) { if (!fs.existsSync(path.join(evidenceDir, file))) issues.push(file + ' is missing.'); }
  if (!metadata) return issues;
  if (
    metadata.assetIntegrity?.schemaVersion !== 1
    || metadata.assetIntegrity?.algorithm !== 'SHA-256'
    || !/^[a-f0-9]{64}$/.test(metadata.assetIntegrity?.rootSha256 || '')
    || !Number.isSafeInteger(metadata.assetIntegrity?.assetCount)
    || metadata.assetIntegrity.assetCount <= 0
  ) issues.push('Asset integrity evidence is invalid or missing.');
  if (metadata.dirty && !allowDirty) issues.push('Working tree was dirty when evidence was created.');
  if (finalMode && !metadata.deviceEvidence) issues.push('Final mode requires device evidence.');
  if (finalMode && !metadata.freshInstall) issues.push('Final mode requires fresh-install evidence.');
  if (finalMode && !metadata.signed) issues.push('Final mode requires signed release evidence.');
  if (artifacts.length === 0) issues.push('No Android artifacts are listed in metadata.json.');

  const checksumEntries = readChecksumFile(path.join(evidenceDir, 'SHA256SUMS.txt'), {
    issues,
    normalizeKey: (key) => key.replaceAll('/', path.sep),
  });
  const artifactNames = new Set();
  for (const artifact of artifacts) {
    if (!artifact.copied || !artifact.sha256) { issues.push('Artifact metadata is missing copied path or sha256.'); continue; }
    const artifactPath = path.resolve(repoRoot, artifact.copied);
    const relativeToEvidence = path.relative(evidenceDir, artifactPath);
    if (relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) { issues.push('Artifact path escapes evidence directory: ' + artifact.copied); continue; }
    if (!fs.existsSync(artifactPath) || !fs.statSync(artifactPath).isFile()) { issues.push('Copied artifact is missing: ' + artifact.copied); continue; }
    const actualHash = sha256(artifactPath);
    if (artifact.sha256 !== actualHash) issues.push('metadata.json sha256 mismatch for ' + artifact.copied);
    if (artifact.sizeBytes !== fs.statSync(artifactPath).size) issues.push('metadata.json size mismatch for ' + artifact.copied);
    const checksumHash = checksumEntries.get(artifact.copied.replaceAll('/', path.sep));
    if (!checksumHash) issues.push('SHA256SUMS.txt is missing artifact: ' + artifact.copied);
    else if (checksumHash !== actualHash) issues.push('SHA256SUMS.txt sha256 mismatch for ' + artifact.copied);
    artifactNames.add(artifact.copied.replaceAll('/', path.sep));
  }
  for (const name of checksumEntries.keys()) { if (!artifactNames.has(name)) issues.push('SHA256SUMS.txt has extra artifact: ' + name); }

  if (metadata.deviceEvidence || finalMode) {
    for (const file of ['android-device-doctor.txt', 'android-device-security.txt']) { if (!fs.existsSync(path.join(evidenceDir, file))) issues.push(file + ' is required but missing.'); }
  }
  if (finalMode && stats.fieldsMissing.length) issues.push('Checklist candidate fields are incomplete: ' + stats.fieldsMissing.join(', '));
  if (finalMode && stats.unchecked > 0) issues.push('Checklist has unchecked release items: ' + stats.unchecked);
  if (finalMode && stats.checked === 0) issues.push('Checklist has no checked release items.');
  if (requireBiometricMatrix && !biometricStats.approved) issues.push('Biometric production approval matrix is incomplete: ' + biometricStats.missing.join(', '));
  return issues;
}

function main() {
  if (hasFlag(args, '--help')) { console.log(usage()); return; }
  const bootstrapIssues = [];
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) bootstrapIssues.push('Evidence directory not found: ' + evidenceDir);
  const metadata = bootstrapIssues.length ? null : readJsonSafe(path.join(evidenceDir, 'metadata.json'), bootstrapIssues);
  const artifacts = Array.isArray(metadata?.artifacts) ? metadata.artifacts : [];
  const checklistPath = path.join(evidenceDir, 'ANDROID_MANUAL_SMOKE_CHECKLIST.md');
  const stats = checklistStats(checklistPath, ANDROID_CHECKLIST_FIELDS);
  const biometricStats = biometricMatrixStats(checklistPath);
  const issues = bootstrapIssues.concat(bootstrapIssues.length ? [] : verifyEvidence(metadata, artifacts, stats, biometricStats));
  const passed = issues.length === 0;

  console.log('Android release evidence summary');
  console.log('Status: ' + (passed ? 'PASS' : 'BLOCKED'));
  console.log('Mode: ' + (finalMode ? 'final distribution' : 'standard evidence'));
  console.log('Evidence: ' + path.relative(repoRoot, evidenceDir));
  console.log('Commit: ' + (metadata?.commit || '<unknown>'));
  console.log('Branch: ' + (metadata?.branch || '<unknown>'));
  console.log('Dirty: ' + formatBool(Boolean(metadata?.dirty)));
  console.log('Signed: ' + formatBool(Boolean(metadata?.signed)));
  console.log('Fresh install: ' + formatBool(Boolean(metadata?.freshInstall)));
  console.log('Device evidence: ' + formatBool(Boolean(metadata?.deviceEvidence)));
  console.log('Asset integrity root: ' + (metadata?.assetIntegrity?.rootSha256 || '<missing>'));
  console.log('Artifacts: ' + artifacts.length);
  for (const artifact of artifacts) console.log(' - ' + artifact.copied + ' (' + artifact.sizeBytes + ' bytes, sha256 ' + String(artifact.sha256 || '').slice(0, 12) + '...)');
  console.log('Checklist checked: ' + stats.checked);
  console.log('Checklist unchecked: ' + stats.unchecked);
  console.log('Checklist missing fields: ' + (stats.fieldsMissing.length ? stats.fieldsMissing.join(', ') : 'none'));
  console.log('Biometric production matrix: ' + (biometricStats.approved ? 'approved' : 'blocked'));
  console.log('Biometric missing fields: ' + (biometricStats.missing.length ? biometricStats.missing.join(', ') : 'none'));
  if (!passed) {
    console.log('');
    console.log('Blocking issues:');
    for (const issue of issues) console.log(' - ' + issue);
    process.exit(1);
  }
}

main();
