const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const allowDirty = args.has('--allow-dirty');
const includeDeviceEvidence = args.has('--device');
const enableAutofill = args.has('--enable-autofill');
const signed = args.has('--signed');
const deviceModeArgs = signed ? ['--release'] : [];
const androidOutputsRoot = path.join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs');
const manualSmokeChecklistPath = path.join(repoRoot, 'docs', 'ANDROID_MANUAL_SMOKE_CHECKLIST.md');
const releaseRoot = path.join(repoRoot, 'release-local', 'android');
const startedAt = new Date();
const stamp = startedAt.toISOString().replace(/[:.]/g, '-');
const outDir = path.join(releaseRoot, stamp);

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

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

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function copyArtifact(file) {
  const destination = path.join(outDir, 'artifacts', path.basename(file));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(file, destination);
  return destination;
}

function findArtifacts() {
  return walk(androidOutputsRoot)
    .filter((file) => ['.apk', '.aab'].includes(path.extname(file).toLowerCase()))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const report = run(npmCommand, ['run', 'android:release:report', '--', '--strict'], {
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
  androidHome: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '',
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
  fs.copyFileSync(manualSmokeChecklistPath, path.join(outDir, 'ANDROID_MANUAL_SMOKE_CHECKLIST.md'));
}

console.log(`Android release evidence written to ${path.relative(repoRoot, outDir)}`);
console.log(`Artifacts copied: ${copiedArtifacts.length}`);
