const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const releaseLocalDir = path.join(rootDir, 'release-local');
const packageJson = require(path.join(rootDir, 'package.json'));
const args = process.argv.slice(2);

const platform = getArgValue('--platform') || detectPlatform();
const explicitDir = getArgValue('--dir');
const evidenceDir = explicitDir ? path.resolve(rootDir, explicitDir) : path.join(releaseLocalDir, platform);
const allowDirty = hasFlag('--allow-dirty');
const allowEmpty = hasFlag('--allow-empty');

function hasFlag(flag) {
  return args.includes(flag);
}

function getArgValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function detectPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function usage() {
  return [
    'Desktop release evidence verifier',
    '',
    'Usage:',
    '  npm run desktop:release:evidence -- [options]',
    '',
    'Options:',
    '  --platform <windows|linux|macos>  Evidence platform. Defaults to host platform.',
    '  --dir <path>                       Evidence directory. Defaults to release-local/<platform>.',
    '  --allow-dirty                    Permit metadata.json dirty=true for internal diagnostics.',
    '  --allow-empty                    Permit evidence with no copied file artifacts.',
    '  --help                           Show this help.',
  ].join('\n');
}

function fail(message) {
  throw new Error(message);
}

function assertPlatform(value) {
  if (!['windows', 'linux', 'macos'].includes(value)) {
    fail('Unsupported desktop release platform: ' + value);
  }
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

function directoryStats(dir) {
  const files = walk(dir).filter(file => fs.existsSync(file) && fs.statSync(file).isFile());
  return {
    fileCount: files.length,
    sizeBytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
  };
}

function gitValue(commandArgs, fallback = '<unknown>') {
  try {
    return execFileSync('git', commandArgs, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch {
    return fallback;
  }
}

function readChecksumFile(file) {
  const entries = new Map();
  const contents = fs.readFileSync(file, 'utf8').trim();
  if (!contents) return entries;

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    if (!match) {
      fail('Invalid checksum line: ' + line);
    }
    entries.set(match[2], match[1].toLowerCase());
  }
  return entries;
}

function resolveArtifactPath(artifact) {
  if (!artifact || typeof artifact.path !== 'string') {
    fail('Artifact entry is missing a path.');
  }
  const fullPath = path.resolve(rootDir, artifact.path);
  const relativeToEvidence = path.relative(evidenceDir, fullPath);
  if (relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) {
    fail('Artifact path escapes evidence directory: ' + artifact.path);
  }
  return fullPath;
}

function verifyChecklist(file, metadata) {
  const contents = fs.readFileSync(file, 'utf8');
  for (const expected of [
    '- Version: ' + metadata.version,
    '- Commit: ' + metadata.commit,
    '- Platform: ' + metadata.platform,
  ]) {
    if (!contents.includes(expected)) {
      fail('Desktop manual smoke checklist is not prefilled with: ' + expected);
    }
  }
}

function verifyReleaseNotes(file, metadata) {
  const contents = fs.readFileSync(file, 'utf8');
  for (const expected of [
    '# Aegis Vault 7 ' + metadata.version + ' Desktop Release Notes',
    'Platform: ' + metadata.platform,
    'Commit: ' + metadata.commit,
    '## SHA-256 Checksums',
    '## Recovery And Safety Notes',
  ]) {
    if (!contents.includes(expected)) {
      fail('RELEASE_NOTES.md is missing expected release context: ' + expected);
    }
  }
}

function verifySigningReport(file, metadata) {
  const contents = fs.readFileSync(file, 'utf8');
  for (const expected of [
    '# Aegis Vault 7 Desktop Signing Report',
    'Version: ' + metadata.version,
    'Platform: ' + metadata.platform,
    'Commit: ' + metadata.commit,
    '## Results',
  ]) {
    if (!contents.includes(expected)) {
      fail('DESKTOP_SIGNATURES.md is missing expected signing context: ' + expected);
    }
  }
}

function verifyEvidence() {
  assertPlatform(platform);

  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    fail('Desktop release evidence directory not found: ' + evidenceDir);
  }

  const metadataPath = path.join(evidenceDir, 'metadata.json');
  const checksumsPath = path.join(evidenceDir, 'SHA256SUMS.txt');
  const readmePath = path.join(evidenceDir, 'README.md');
  const releaseNotesPath = path.join(evidenceDir, 'RELEASE_NOTES.md');
  const signaturesPath = path.join(evidenceDir, 'DESKTOP_SIGNATURES.md');
  const checklistPath = path.join(evidenceDir, 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md');

  for (const file of [metadataPath, checksumsPath, readmePath, releaseNotesPath, signaturesPath, checklistPath]) {
    if (!fs.existsSync(file)) {
      fail('Required release evidence file is missing: ' + path.relative(rootDir, file));
    }
  }

  const metadata = readJson(metadataPath);
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];
  if (metadata.packageName !== packageJson.name) {
    fail('metadata.json packageName mismatch: ' + metadata.packageName);
  }
  if (metadata.version !== packageJson.version) {
    fail('metadata.json version mismatch: ' + metadata.version + ' !== ' + packageJson.version);
  }
  if (metadata.platform !== platform) {
    fail('metadata.json platform mismatch: ' + metadata.platform + ' !== ' + platform);
  }
  if (metadata.dirty && !allowDirty) {
    fail('Refusing desktop release evidence from a dirty working tree. Use --allow-dirty only for internal diagnostics.');
  }

  const currentCommit = gitValue(['rev-parse', 'HEAD']);
  if (currentCommit !== '<unknown>' && metadata.commit !== currentCommit) {
    fail('metadata.json commit mismatch: ' + metadata.commit + ' !== ' + currentCommit);
  }

  if (artifacts.length === 0 && !allowEmpty) {
    fail('metadata.json contains no artifacts. Use --allow-empty only for script diagnostics.');
  }

  const checksumEntries = readChecksumFile(checksumsPath);
  const fileArtifactNames = new Set();

  for (const artifact of artifacts) {
    const artifactPath = resolveArtifactPath(artifact);
    if (!fs.existsSync(artifactPath)) {
      fail('Artifact listed in metadata.json is missing: ' + artifact.path);
    }

    const stats = fs.statSync(artifactPath);
    if (artifact.type === 'file') {
      if (!stats.isFile()) fail('Artifact type mismatch, expected file: ' + artifact.path);
      const actualHash = sha256(artifactPath);
      if (artifact.sha256 !== actualHash) {
        fail('metadata.json sha256 mismatch for ' + artifact.name);
      }
      if (artifact.sizeBytes !== stats.size) {
        fail('metadata.json size mismatch for ' + artifact.name);
      }
      const checksumHash = checksumEntries.get(artifact.name);
      if (!checksumHash) {
        fail('SHA256SUMS.txt is missing file artifact: ' + artifact.name);
      }
      if (checksumHash !== actualHash) {
        fail('SHA256SUMS.txt sha256 mismatch for ' + artifact.name);
      }
      fileArtifactNames.add(artifact.name);
    } else if (artifact.type === 'directory') {
      if (!stats.isDirectory()) fail('Artifact type mismatch, expected directory: ' + artifact.path);
      const dirStats = directoryStats(artifactPath);
      if (artifact.fileCount !== dirStats.fileCount || artifact.sizeBytes !== dirStats.sizeBytes) {
        fail('metadata.json directory stats mismatch for ' + artifact.name);
      }
      if (artifact.sha256 !== null) {
        fail('Directory artifacts must not have sha256 values: ' + artifact.name);
      }
    } else {
      fail('Unsupported artifact type in metadata.json: ' + artifact.type);
    }
  }

  for (const name of checksumEntries.keys()) {
    if (!fileArtifactNames.has(name)) {
      fail('SHA256SUMS.txt contains an entry not present in metadata.json: ' + name);
    }
  }

  verifyChecklist(checklistPath, metadata);
  verifyReleaseNotes(releaseNotesPath, metadata);
  verifySigningReport(signaturesPath, metadata);
  console.log('Desktop release evidence verified: ' + path.relative(rootDir, evidenceDir));
  console.log('Artifacts: ' + artifacts.length);
}

if (hasFlag('--help')) {
  console.log(usage());
  process.exit(0);
}

verifyEvidence();
