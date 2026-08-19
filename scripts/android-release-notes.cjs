const fs = require('fs');
const path = require('path');
const {
  hasFlag,
  getArgValue,
  failThrow: fail,
  readJson,
  readText,
  shortHash,
  firstMatch,
  formatBytes,
  checklistStats,
  checklistField,
  isPlaceholderValue,
} = require('./release-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const packageJson = require(path.join(repoRoot, 'package.json'));
const args = process.argv.slice(2);
const explicitDir = getArgValue(args, '--dir');
const channel = getArgValue(args, '--channel') || 'internal Android candidate';
const signed = hasFlag(args, '--signed');
const finalMode = hasFlag(args, '--final');
const biometricClaim = hasFlag(args, '--biometric-claim');
const releaseRoot = path.join(repoRoot, 'release-local', 'android');
const evidenceDir = explicitDir ? path.resolve(repoRoot, explicitDir) : findLatestEvidenceDir();

function usage() {
  return [
    'Android release notes generator',
    '',
    'Usage:',
    '  npm run android:release:notes -- [options]',
    '',
    'Options:',
    '  --dir <path>       Evidence directory. Defaults to latest release-local/android/* folder.',
    '  --channel <name>   Release channel label. Defaults to internal Android candidate.',
    '  --signed           Mark the candidate as signed in the generated notes.',
    '  --final            Mark notes as final-distribution gated.',
    '  --biometric-claim  Permit production biometric support wording only after matrix approval.',
    '  --help             Show this help.',
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

function artifactKind(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.aab')) return 'Android App Bundle';
  if (lower.endsWith('.apk') && lower.includes('release')) return 'Android release APK';
  if (lower.endsWith('.apk') && lower.includes('debug')) return 'Android debug APK';
  if (lower.endsWith('.apk')) return 'Android APK';
  return 'Android artifact';
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

function artifactLines(artifacts) {
  if (artifacts.length === 0) return ['- No copied Android artifacts were recorded.'];
  return artifacts.map((artifact) => '- `' + artifact.copied + '` - ' + artifactKind(artifact.copied || artifact.source) + ', ' + formatBytes(artifact.sizeBytes));
}

function checksumLines(artifacts) {
  const lines = artifacts.filter((artifact) => artifact.sha256).map((artifact) => '- `' + artifact.copied + '` - `' + artifact.sha256 + '`');
  return lines.length ? lines : ['- No artifact checksums were recorded.'];
}

function generateNotes() {
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) fail('Android evidence directory not found: ' + evidenceDir);
  const metadataPath = path.join(evidenceDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) fail('metadata.json not found. Run Android release evidence collection first: ' + metadataPath);

  const metadata = readJson(metadataPath);
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];
  const report = readText(path.join(evidenceDir, 'android-release-report.txt'));
  const checklistPath = path.join(evidenceDir, 'ANDROID_MANUAL_SMOKE_CHECKLIST.md');
  const checklist = checklistStats(checklistPath, ANDROID_CHECKLIST_FIELDS);
  const biometricMatrix = biometricMatrixStats(checklistPath);
  const reportVersion = firstMatch(report, [/version: ([^\r\n]+)/i, /versionName[:=]\s*([^\r\n]+)/i], packageJson.version);
  const packageName = firstMatch(report, [/package(?: name)?: ([^\r\n]+)/i, /applicationId[:=]\s*([^\r\n]+)/i], metadata.signed ? 'com.hafgit99.aegisvault7' : 'com.hafgit99.aegisvault7.debug');
  const mode = firstMatch(report, /Mode: ([^\r\n]+)/i, metadata.signed ? 'release candidate artifacts only' : 'debug candidate artifacts only');

  if (reportVersion !== packageJson.version) fail('Android report version mismatch: ' + reportVersion + ' !== ' + packageJson.version);
  if (signed && !metadata.signed) fail('--signed was requested but metadata.signed is false.');
  if (finalMode && (!metadata.signed || !metadata.deviceEvidence || !metadata.freshInstall || checklist.unchecked > 0 || checklist.fieldsMissing.length > 0)) {
    fail('Final Android release notes require signed, device, fresh-install, and completed checklist evidence.');
  }
  if (biometricClaim && !biometricMatrix.approved) {
    fail('Production biometric claim requires completed Pixel/Samsung/Xiaomi and Android 12/13/14/15 biometric matrix evidence.');
  }

  const notes = [
    '# Aegis Vault 7 ' + packageJson.version + ' Android Release Notes',
    '',
    'Channel: ' + channel,
    'Package: ' + packageName,
    'Mode: ' + mode,
    'Commit: ' + metadata.commit + ' (' + shortHash(metadata.commit) + ')',
    'Branch: ' + metadata.branch,
    'Created: ' + metadata.createdAt,
    'Working tree clean: ' + (metadata.dirty ? 'no' : 'yes'),
    'Signed candidate: ' + (metadata.signed ? 'yes' : 'no'),
    'Fresh install evidence: ' + (metadata.freshInstall ? 'yes' : 'no'),
    'Device evidence: ' + (metadata.deviceEvidence ? 'yes' : 'no'),
    'Final gate requested: ' + (finalMode ? 'yes' : 'no'),
    'Production biometric claim: ' + (biometricClaim && biometricMatrix.approved ? 'approved' : 'not claimed'),
    '',
    '## Highlights',
    '',
    '- Local-first encrypted Android vault candidate built through the Android release gate.',
    '- Android document picker flows cover Emergency Kit, backup export/import, and attachment download.',
    '- Android Autofill, FLAG_SECURE screenshot protection, safe-area layout, and private app-data checks are part of the release evidence path.',
    ...(biometricClaim && biometricMatrix.approved ? ['- Android biometric unlock has completed the production OEM/version approval matrix for this candidate.'] : ['- Android biometric unlock remains release-candidate validation only unless the production approval matrix is completed.']),
    '',
    '## Artifacts',
    '',
    ...artifactLines(artifacts),
    '',
    '## SHA-256 Checksums',
    '',
    ...checksumLines(artifacts),
    '',
    '## Manual Checklist Status',
    '',
    '- Checked items: ' + checklist.checked,
    '- Unchecked items: ' + checklist.unchecked,
    '- Missing candidate fields: ' + (checklist.fieldsMissing.length ? checklist.fieldsMissing.join(', ') : 'none'),
    '- Biometric production matrix: ' + (biometricMatrix.approved ? 'approved' : 'blocked'),
    '- Biometric missing fields: ' + (biometricMatrix.missing.length ? biometricMatrix.missing.join(', ') : 'none'),
    '',
    '## Verification Before Sharing',
    '',
    '- Run `npm run android:release:evidence:verify -- --dir ' + path.relative(repoRoot, evidenceDir).replaceAll('\\', '/') + ' --require-device --require-fresh-install --require-signed --require-completed-checklist` for final signed candidates.',
    '- Run `npm run android:release:evidence:summary -- --dir ' + path.relative(repoRoot, evidenceDir).replaceAll('\\', '/') + ' --final` and confirm `Status: PASS`.',
    '- Before claiming production biometric support, run `npm run android:release:evidence:verify -- --dir ' + path.relative(repoRoot, evidenceDir).replaceAll('\\', '/') + ' --require-biometric-matrix`.',
    '- Confirm `metadata.json` reports `dirty: false` before sharing outside trusted testing.',
    '- Keep the completed `ANDROID_MANUAL_SMOKE_CHECKLIST.md` with the evidence folder.',
    '',
    '## Recovery And Safety Notes',
    '',
    '- Aegis Vault 7 cannot recover a lost master password or lost Account Secret Key.',
    '- Keep Emergency Kit material offline and separate from the phone.',
    '- Encrypted `.aegis` backups require the backup password.',
    '- Plain JSON exports are unsafe and should only be used offline in a trusted location.',
    '- Local malware, OS compromise, rooted devices, and untrusted APK sources remain outside the app protection boundary.',
    '',
    '## Evidence Files',
    '',
    '- `metadata.json`',
    '- `SHA256SUMS.txt`',
    '- `android-release-report.txt`',
    '- `ANDROID_MANUAL_SMOKE_CHECKLIST.md`',
    '- `README.md`',
    ...(metadata.deviceEvidence ? ['- `android-device-doctor.txt`', '- `android-device-security.txt`'] : []),
    '',
  ].join('\n');

  const output = path.join(evidenceDir, 'ANDROID_RELEASE_NOTES.md');
  fs.writeFileSync(output, notes, 'utf8');
  console.log('Android release notes written to ' + path.relative(repoRoot, output));
}

if (hasFlag(args, '--help')) { console.log(usage()); process.exit(0); }
generateNotes();
