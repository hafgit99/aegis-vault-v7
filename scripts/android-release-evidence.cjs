const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256, firstMatch } = require('./release-utils.cjs');
const { findLatestAndroidCandidateArtifacts } = require('./android-artifact-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const allowDirty = args.has('--allow-dirty');
const includeDeviceEvidence = args.has('--device');
const enableAutofill = args.has('--enable-autofill');
const signed = args.has('--signed');
const freshInstall = args.has('--fresh-install');
const deviceModeArgs = signed ? ['--release'] : [];
const buildType = signed ? 'release' : 'debug';
const manualSmokeChecklistPath = path.join(repoRoot, 'docs', 'ANDROID_MANUAL_SMOKE_CHECKLIST.md');
const releaseRoot = path.join(repoRoot, 'release-local', 'android');
const startedAt = new Date();
// Build the evidence directory stamp.
//
// All machine-readable artifacts (metadata.json, README, checksums) carry
// the canonical ISO 8601 UTC timestamp, which is the only format CI tooling
// reliably understands. The directory name itself, however, is what
// engineers see when they `ls release-local/android/`, so we honour the
// `TZ` environment variable when present: with `TZ=Europe/Istanbul` the
// stamp reads `2026-08-03T15-42-22` instead of `2026-08-03T12-42-22Z`,
// removing the mental UTC offset a developer has to apply by hand. When
// `TZ` is unset we keep the previous UTC behaviour verbatim so existing
// automation (CI logs, evidence collectors, downstream dashboards) keeps
// matching directory names.
function buildEvidenceStamp(now) {
  if (!process.env.TZ) {
    return now.toISOString().replace(/[:.]/g, '-');
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: process.env.TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const pick = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  const date = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const time = `${pick('hour')}-${pick('minute')}-${pick('second')}`;
  return `${date}T${time}`;
}
const stamp = buildEvidenceStamp(startedAt);
const outDir = path.join(releaseRoot, stamp);

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: options.shell ?? false,
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    }).trim();
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || error.message || ''}`.trim();
    return output || '<command failed>';
  }
}

function isSpawnBlocked(output) {
  return /^spawnSync .* EPERM$/i.test(String(output || '').trim());
}

function readGitHeadFallback() {
  const headPath = path.join(repoRoot, '.git', 'HEAD');
  const head = fs.existsSync(headPath) ? fs.readFileSync(headPath, 'utf8').trim() : '';

  if (!head.startsWith('ref: ')) {
    return {
      branch: head ? 'detached' : '<unknown>',
      commit: head || '<unknown>',
    };
  }

  const ref = head.slice('ref: '.length);
  const refPath = path.join(repoRoot, '.git', ...ref.split('/'));
  const packedRefsPath = path.join(repoRoot, '.git', 'packed-refs');
  let commit = fs.existsSync(refPath) ? fs.readFileSync(refPath, 'utf8').trim() : '';

  if (!commit && fs.existsSync(packedRefsPath)) {
    const packedLine = fs.readFileSync(packedRefsPath, 'utf8')
      .split(/\r?\n/)
      .find((line) => line.endsWith(` ${ref}`));
    commit = packedLine?.split(' ')[0] || '';
  }

  return {
    branch: ref.replace(/^refs\/heads\//, ''),
    commit: commit || '<unknown>',
  };
}

function gitValue(args, fallbackValue) {
  const output = run('git', args);
  return isSpawnBlocked(output) || output === '<command failed>' ? fallbackValue : output;
}

function readAssetIntegrityEvidence() {
  const manifestPath = path.join(repoRoot, 'dist', 'aegis-integrity.json');
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
function copyArtifact(file) {
  const destination = path.join(outDir, 'artifacts', path.basename(file));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
  return destination;
}

function completedManualChecklist(contents, metadata, report, deviceDoctorReport) {
  const version = firstMatch(report, /version: ([^\r\n]+)/, '<unknown>');
  const deviceModel = firstMatch(deviceDoctorReport, /INFO device-model ([^\r\n]+)/, includeDeviceEvidence ? '<unknown>' : 'not run');
  const deviceSdk = firstMatch(deviceDoctorReport, /INFO device-sdk ([^\r\n]+)/, includeDeviceEvidence ? '<unknown>' : 'not run');
  const buildType = signed ? 'signed release APK' : 'debug APK';
  const replacements = new Map([
    ['- Version:', '- Version: ' + version],
    ['- Commit:', '- Commit: ' + metadata.commit],
    ['- Device model:', '- Device model: ' + deviceModel],
    ['- Android version / SDK:', '- Android version / SDK: SDK ' + deviceSdk],
    ['- Build type:', '- Build type: ' + buildType],
    ['- Fresh install used:', '- Fresh install used: ' + (metadata.freshInstall ? 'yes' : 'no')],
    ['- Date:', '- Date: ' + metadata.createdAt],
  ]);

  return contents
    .split(/\r?\n/)
    .map((line) => replacements.get(line) || line)
    .join('\n') + '\n';
}

function findArtifacts() {
  return findLatestAndroidCandidateArtifacts(repoRoot, { buildType });
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const report = run(npmCommand, ['run', 'android:release:report', '--', '--strict', ...(signed ? ['--signed'] : [])], {
  shell: process.platform === 'win32',
});
const deviceDoctorReport = includeDeviceEvidence
  ? run(npmCommand, ['run', 'android:device:doctor', '--', ...(enableAutofill ? ['--enable-autofill'] : []), ...deviceModeArgs], { shell: process.platform === 'win32' })
  : '';
const deviceSecurityReport = includeDeviceEvidence
  ? run(npmCommand, ['run', 'android:device:security', '--', '--launch', ...deviceModeArgs], { shell: process.platform === 'win32' })
  : '';
const gitFallback = readGitHeadFallback();
const rawDirtyStatus = run('git', ['status', '--short']);
const dirtyStatus = isSpawnBlocked(rawDirtyStatus)
  ? `<dirty status unavailable: ${rawDirtyStatus}>`
  : rawDirtyStatus;
const dirty = Boolean(dirtyStatus);
if (dirty && !allowDirty) {
  console.error('Refusing to create shareable Android release evidence from a dirty working tree.');
  console.error('Commit or stash changes first, or pass --allow-dirty for local/internal evidence only.');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

const artifacts = findArtifacts();
const copiedArtifacts = artifacts.map((file) => {
  const copied = copyArtifact(file);
  const stats = fs.statSync(file);
  return {
    source: path.relative(repoRoot, file),
    copied: path.relative(repoRoot, copied),
    sizeBytes: stats.size,
    sha256: sha256(file),
    modifiedAt: stats.mtime.toISOString(),
  };
});

const metadata = {
  createdAt: startedAt.toISOString(),
  platform: `${os.platform()} ${os.release()} ${os.arch()}`,
  node: process.version,
  commit: gitValue(['rev-parse', 'HEAD'], gitFallback.commit),
  branch: gitValue(['branch', '--show-current'], gitFallback.branch),
  dirty,
  dirtyStatus,
  allowDirty,
  deviceEvidence: includeDeviceEvidence,
  enableAutofill,
  signed,
  freshInstall,
  androidHome: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '',
  assetIntegrity: readAssetIntegrityEvidence(),
  artifacts: copiedArtifacts,
};

fs.writeFileSync(path.join(outDir, 'android-release-report.txt'), report + '\n');
if (includeDeviceEvidence) {
  fs.writeFileSync(path.join(outDir, 'android-device-doctor.txt'), deviceDoctorReport + '\n');
  fs.writeFileSync(path.join(outDir, 'android-device-security.txt'), deviceSecurityReport + '\n');
}
fs.writeFileSync(path.join(outDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
fs.writeFileSync(
  path.join(outDir, 'SHA256SUMS.txt'),
  copiedArtifacts.map((artifact) => `${artifact.sha256}  ${artifact.copied.replaceAll('\\', '/')}`).join('\n') + '\n',
);
fs.writeFileSync(
  path.join(outDir, 'README.md'),
  [
    '# Android Release Evidence',
    '',
    `Created: ${metadata.createdAt}`,
    `Commit: ${metadata.commit}`,
    `Branch: ${metadata.branch}`,
    `Dirty working tree: ${metadata.dirty ? 'yes' : 'no'}`,
    `Signed candidate: ${metadata.signed ? 'yes' : 'no'}`,
    `Fresh install smoke: ${metadata.freshInstall ? 'yes' : 'no'}`,
    `Device evidence: ${metadata.deviceEvidence ? 'yes' : 'no'}`,
    'Asset integrity root: ' + metadata.assetIntegrity.rootSha256,
    '',
    '## Files',
    '',
    '- `android-release-report.txt`: strict Android artifact/security report.',
    ...(includeDeviceEvidence ? ['- `android-device-doctor.txt`: connected-device diagnostic report.'] : []),
    ...(includeDeviceEvidence ? ['- `android-device-security.txt`: connected-device security/runtime report.'] : []),
    '- `metadata.json`: machine-readable build metadata.',
    '- `SHA256SUMS.txt`: checksums for copied artifacts.',
    '- `ANDROID_MANUAL_SMOKE_CHECKLIST.md`: manual QA checklist for this candidate.',
    '- `artifacts/`: copied APK/AAB files for this candidate.',
    '',
  ].join('\n'),
);
if (fs.existsSync(manualSmokeChecklistPath)) {
  const checklist = completedManualChecklist(fs.readFileSync(manualSmokeChecklistPath, 'utf8'), metadata, report, deviceDoctorReport);
  fs.writeFileSync(path.join(outDir, 'ANDROID_MANUAL_SMOKE_CHECKLIST.md'), checklist);
}

console.log(`Android release evidence written to ${path.relative(repoRoot, outDir)}`);
console.log(`Artifacts copied: ${copiedArtifacts.length}`);
