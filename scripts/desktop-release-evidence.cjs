const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  hasFlag,
  getArgValue,
  detectPlatform,
  assertPlatform,
  failThrow: fail,
  readJson,
  sha256,
  walk,
  directoryStats,
  readChecksumFile,
} = require('./release-utils.cjs');
const { archiveContainsForbiddenDebugArtifact, isForbiddenDebugArtifact, signingCoverage } = require('./desktop-signing-policy.cjs');

const rootDir = path.resolve(__dirname, '..');
const releaseLocalDir = path.join(rootDir, 'release-local');
const packageJson = require(path.join(rootDir, 'package.json'));
const args = process.argv.slice(2);

const platform = getArgValue(args, '--platform') || detectPlatform();
const explicitDir = getArgValue(args, '--dir');
const evidenceDir = explicitDir ? path.resolve(rootDir, explicitDir) : path.join(releaseLocalDir, platform);
const allowDirty = hasFlag(args, '--allow-dirty');
const allowEmpty = hasFlag(args, '--allow-empty');
const requireCompletedChecklist = hasFlag(args, '--require-completed-checklist');
const requireSignedArtifacts = hasFlag(args, '--require-signed-artifacts');

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
    '  --require-completed-checklist    Fail unless the manual smoke checklist is completed.',
    '  --require-signed-artifacts       Fail unless every Windows/macOS signable artifact is verified.',
    '  --help                           Show this help.',
  ].join('\n');
}

function gitValue(commandArgs, fallback = '<unknown>') {
  try {
    return execFileSync('git', commandArgs, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || fallback;
  } catch {
    return fallback;
  }
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

function verifyCompletedChecklist(file) {
  const contents = fs.readFileSync(file, 'utf8');
  const requiredFields = [
    '- Version:',
    '- Commit:',
    '- Platform:',
    '- Build type:',
    '- Signed artifacts:',
    '- Tester:',
    '- Date:',
  ];

  for (const label of requiredFields) {
    const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(label));
    if (!line || line.slice(label.length).trim().length === 0) {
      fail('DESKTOP_MANUAL_SMOKE_CHECKLIST.md is missing a completed candidate field: ' + label);
    }
  }

  const unchecked = contents.split(/\r?\n/).filter((line) => /^- \[ \]/.test(line));
  if (unchecked.length > 0) {
    fail('DESKTOP_MANUAL_SMOKE_CHECKLIST.md has unchecked release items: ' + unchecked.slice(0, 5).join(' | '));
  }

  const checkedCount = contents.split(/\r?\n/).filter((line) => /^- \[x\]/i.test(line)).length;
  if (checkedCount === 0) {
    fail('DESKTOP_MANUAL_SMOKE_CHECKLIST.md does not contain any completed checklist items.');
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

function verifySigningReport(file, metadata, artifacts) {
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

  if (!requireSignedArtifacts) return;
  const coverage = signingCoverage(artifacts, metadata.platform, contents);
  if (coverage.required === 0) {
    fail('Signed artifact verification was required, but metadata.json contains no signable Windows/macOS artifacts.');
  }
  if (!coverage.complete) {
    fail(`Required desktop signatures are incomplete: verified ${coverage.verified}/${coverage.required}, applicable ${coverage.applicable}/${coverage.required}.`);
  }
}
function verifyEvidence() {
  assertPlatform(platform);

  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) {
    fail('Desktop release evidence directory not found: ' + evidenceDir);
  }

  const forbiddenDebugArtifacts = walk(evidenceDir).filter((file) =>
    isForbiddenDebugArtifact(path.relative(evidenceDir, file)),
  );
  if (forbiddenDebugArtifacts.length > 0) {
    fail('Forbidden debug artifact found in desktop evidence: ' + path.relative(evidenceDir, forbiddenDebugArtifacts[0]));
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
      if (/\.(?:xpi|zip)$/i.test(artifact.name) && archiveContainsForbiddenDebugArtifact(fs.readFileSync(artifactPath))) {
        fail('Archive contains a forbidden debug artifact: ' + artifact.name);
      }
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
  if (requireCompletedChecklist) verifyCompletedChecklist(checklistPath);
  verifyReleaseNotes(releaseNotesPath, metadata);
  verifySigningReport(signaturesPath, metadata, artifacts);
  console.log('Desktop release evidence verified: ' + path.relative(rootDir, evidenceDir));
  console.log('Artifacts: ' + artifacts.length);
  console.log('Completed checklist required: ' + (requireCompletedChecklist ? 'yes' : 'no'));
  console.log('Signed artifacts required: ' + (requireSignedArtifacts ? 'yes' : 'no'));
}

if (hasFlag(args, '--help')) {
  console.log(usage());
  process.exit(0);
}

verifyEvidence();
