const fs = require('fs');
const path = require('path');
const {
  hasFlag,
  getArgValue,
  detectPlatform,
  readJsonSafe,
  sha256,
  walk,
  directoryStats,
  formatBytes,
  formatBool,
  readChecksumFile,
  checklistStats,
} = require('./release-utils.cjs');
const { archiveContainsForbiddenDebugArtifact, isForbiddenDebugArtifact, signingCoverage } = require('./desktop-signing-policy.cjs');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));
const releaseLocalDir = path.join(rootDir, 'release-local');
const args = process.argv.slice(2);
const platform = getArgValue(args, '--platform') || detectPlatform();
const explicitDir = getArgValue(args, '--dir');
const evidenceDir = explicitDir ? path.resolve(rootDir, explicitDir) : path.join(releaseLocalDir, platform);
const finalMode = hasFlag(args, '--final');
const allowDirty = hasFlag(args, '--allow-dirty');
const allowEmpty = hasFlag(args, '--allow-empty');

function usage() {
  return [
    'Desktop release evidence summary',
    '',
    'Usage:',
    '  npm run desktop:release:evidence:summary -- [options]',
    '',
    'Options:',
    '  --platform <windows|linux|macos>  Evidence platform. Defaults to host platform.',
    '  --dir <path>                       Evidence directory. Defaults to release-local/<platform>.',
    '  --final                           Require completed manual checklist evidence.',
    '  --allow-dirty                     Permit dirty evidence for internal diagnostics.',
    '  --allow-empty                     Permit evidence with no copied file artifacts.',
    '  --help                            Show this help.',
  ].join('\n');
}

const DESKTOP_CHECKLIST_FIELDS = [
  '- Version:',
  '- Commit:',
  '- Platform:',
  '- Build type:',
  '- Signed artifacts:',
  '- Tester:',
  '- Date:',
];

function signingStats(file) {
  if (!fs.existsSync(file)) return { verified: 0, applicable: 0, missing: true };
  const contents = fs.readFileSync(file, 'utf8');
  const verified = (contents.match(/\(verified\)/g) || []).length;
  const applicable = (contents.match(/Applicable: yes/g) || []).length;
  return { verified, applicable, missing: false };
}

function verifyEvidence(metadata, artifacts, stats, signing) {
  const issues = [];
  if (!['windows', 'linux', 'macos'].includes(platform)) issues.push('Unsupported platform: ' + platform);
  const requiredFiles = ['metadata.json', 'SHA256SUMS.txt', 'README.md', 'RELEASE_NOTES.md', 'DESKTOP_SIGNATURES.md', 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md'];
  for (const file of requiredFiles) if (!fs.existsSync(path.join(evidenceDir, file))) issues.push(file + ' is missing.');
  const forbiddenDebugArtifacts = walk(evidenceDir).filter((file) =>
    isForbiddenDebugArtifact(path.relative(evidenceDir, file)),
  );
  for (const file of forbiddenDebugArtifacts) {
    issues.push('Forbidden debug artifact is present: ' + path.relative(evidenceDir, file));
  }
  if (!metadata) return issues;
  if (metadata.packageName !== packageJson.name) issues.push('metadata.json packageName mismatch: ' + metadata.packageName);
  if (metadata.version !== packageJson.version) issues.push('metadata.json version mismatch: ' + metadata.version + ' !== ' + packageJson.version);
  if (metadata.platform !== platform) issues.push('metadata.json platform mismatch: ' + metadata.platform + ' !== ' + platform);
  if (
    metadata.assetIntegrity?.schemaVersion !== 1
    || metadata.assetIntegrity?.algorithm !== 'SHA-256'
    || !/^[a-f0-9]{64}$/.test(metadata.assetIntegrity?.rootSha256 || '')
    || !Number.isSafeInteger(metadata.assetIntegrity?.assetCount)
    || metadata.assetIntegrity.assetCount <= 0
  ) issues.push('Asset integrity evidence is invalid or missing.');
  if (metadata.dirty && !allowDirty) issues.push('Working tree was dirty when evidence was created.');
  if (artifacts.length === 0 && !allowEmpty) issues.push('No desktop artifacts are listed in metadata.json.');

  const checksumEntries = readChecksumFile(path.join(evidenceDir, 'SHA256SUMS.txt'), { issues });
  const fileArtifactNames = new Set();
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact.path !== 'string') { issues.push('Artifact entry is missing a path.'); continue; }
    const artifactPath = path.resolve(rootDir, artifact.path);
    const relativeToEvidence = path.relative(evidenceDir, artifactPath);
    if (relativeToEvidence.startsWith('..') || path.isAbsolute(relativeToEvidence)) { issues.push('Artifact path escapes evidence directory: ' + artifact.path); continue; }
    if (!fs.existsSync(artifactPath)) { issues.push('Artifact is missing: ' + artifact.path); continue; }
    const statsFs = fs.statSync(artifactPath);
    if (artifact.type === 'file') {
      if (!statsFs.isFile()) { issues.push('Artifact type mismatch, expected file: ' + artifact.path); continue; }
      if (/\.(?:xpi|zip)$/i.test(artifact.name) && archiveContainsForbiddenDebugArtifact(fs.readFileSync(artifactPath))) issues.push('Archive contains a forbidden debug artifact: ' + artifact.name);
      const actualHash = sha256(artifactPath);
      if (artifact.sha256 !== actualHash) issues.push('metadata.json sha256 mismatch for ' + artifact.name);
      if (artifact.sizeBytes !== statsFs.size) issues.push('metadata.json size mismatch for ' + artifact.name);
      const checksumHash = checksumEntries.get(artifact.name);
      if (!checksumHash) issues.push('SHA256SUMS.txt is missing file artifact: ' + artifact.name);
      else if (checksumHash !== actualHash) issues.push('SHA256SUMS.txt sha256 mismatch for ' + artifact.name);
      fileArtifactNames.add(artifact.name);
    } else if (artifact.type === 'directory') {
      if (!statsFs.isDirectory()) { issues.push('Artifact type mismatch, expected directory: ' + artifact.path); continue; }
      const dirStats = directoryStats(artifactPath);
      if (artifact.fileCount !== dirStats.fileCount || artifact.sizeBytes !== dirStats.sizeBytes) issues.push('metadata.json directory stats mismatch for ' + artifact.name);
      if (artifact.sha256 !== null) issues.push('Directory artifacts must not have sha256 values: ' + artifact.name);
    } else {
      issues.push('Unsupported artifact type in metadata.json: ' + artifact.type);
    }
  }
  for (const name of checksumEntries.keys()) if (!fileArtifactNames.has(name)) issues.push('SHA256SUMS.txt has extra artifact: ' + name);
  if (finalMode && stats.fieldsMissing.length) issues.push('Checklist candidate fields are incomplete: ' + stats.fieldsMissing.join(', '));
  if (finalMode && stats.unchecked > 0) issues.push('Checklist has unchecked release items: ' + stats.unchecked);
  if (finalMode && stats.checked === 0) issues.push('Checklist has no checked release items.');
  const signingReportPath = path.join(evidenceDir, 'DESKTOP_SIGNATURES.md');
  const signingReport = fs.existsSync(signingReportPath) ? fs.readFileSync(signingReportPath, 'utf8') : '';
  const coverage = signingCoverage(artifacts, platform, signingReport);
  if (finalMode && coverage.required > 0) {
    if (signing.missing) issues.push('Final Windows/macOS evidence requires a signing report.');
    if (coverage.applicable < coverage.required) issues.push(`Signing report covers only ${coverage.applicable}/${coverage.required} signable artifacts.`);
    if (coverage.verified < coverage.required) issues.push(`Final Windows/macOS evidence has only ${coverage.verified}/${coverage.required} verified signatures.`);
  }
  return issues;
}

function main() {
  if (hasFlag(args, '--help')) { console.log(usage()); return; }
  const bootstrapIssues = [];
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) bootstrapIssues.push('Evidence directory not found: ' + evidenceDir);
  const metadata = bootstrapIssues.length ? null : readJsonSafe(path.join(evidenceDir, 'metadata.json'), bootstrapIssues);
  const artifacts = Array.isArray(metadata?.artifacts) ? metadata.artifacts : [];
  const checklist = checklistStats(path.join(evidenceDir, 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md'), DESKTOP_CHECKLIST_FIELDS);
  const signing = signingStats(path.join(evidenceDir, 'DESKTOP_SIGNATURES.md'));
  const issues = bootstrapIssues.concat(bootstrapIssues.length ? [] : verifyEvidence(metadata, artifacts, checklist, signing));
  const passed = issues.length === 0;

  console.log('Desktop release evidence summary');
  console.log('Status: ' + (passed ? 'PASS' : 'BLOCKED'));
  console.log('Mode: ' + (finalMode ? 'final distribution' : 'standard evidence'));
  console.log('Platform: ' + platform);
  console.log('Evidence: ' + path.relative(rootDir, evidenceDir));
  console.log('Version: ' + (metadata?.version || '<unknown>'));
  console.log('Commit: ' + (metadata?.commit || '<unknown>'));
  console.log('Branch: ' + (metadata?.branch || '<unknown>'));
  console.log('Dirty: ' + formatBool(Boolean(metadata?.dirty)));
  console.log('Asset integrity root: ' + (metadata?.assetIntegrity?.rootSha256 || '<missing>'));
  console.log('Artifacts: ' + artifacts.length);
  for (const artifact of artifacts) {
    const hash = artifact.sha256 ? ', sha256 ' + String(artifact.sha256).slice(0, 12) + '...' : '';
    console.log(' - ' + artifact.name + ' (' + artifact.type + ', ' + formatBytes(artifact.sizeBytes) + hash + ')');
  }
  console.log('Checklist checked: ' + checklist.checked);
  console.log('Checklist unchecked: ' + checklist.unchecked);
  console.log('Checklist missing fields: ' + (checklist.fieldsMissing.length ? checklist.fieldsMissing.join(', ') : 'none'));
  console.log('Signable artifacts verified: ' + signing.verified + '/' + signing.applicable + (signing.missing ? ' (signing report missing)' : ''));
  if (!passed) {
    console.log('');
    console.log('Blocking issues:');
    for (const issue of issues) console.log(' - ' + issue);
    process.exit(1);
  }
}

main();
