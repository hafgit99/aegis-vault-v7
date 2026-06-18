const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const androidOutputsRoot = path.join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs');
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

function run(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 20 * 1024 * 1024,
      env: process.env,
    }).trim();
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || error.message || ''}`.trim();
    return output || '<command failed>';
  }
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

fs.mkdirSync(outDir, { recursive: true });

const report = run('npm', ['run', 'android:release:report', '--', '--strict']);
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
  commit: run('git', ['rev-parse', 'HEAD']),
  branch: run('git', ['branch', '--show-current']),
  dirtyStatus: run('git', ['status', '--short']),
  androidHome: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '',
  artifacts: copiedArtifacts,
};

fs.writeFileSync(path.join(outDir, 'android-release-report.txt'), `${report}\n`);
fs.writeFileSync(path.join(outDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
fs.writeFileSync(
  path.join(outDir, 'SHA256SUMS.txt'),
  copiedArtifacts.map((artifact) => `${artifact.sha256}  ${artifact.copied.replaceAll('\\', '/')}`).join('\n') + '\n',
);

console.log(`Android release evidence written to ${path.relative(repoRoot, outDir)}`);
console.log(`Artifacts copied: ${copiedArtifacts.length}`);
