const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const packageJson = require(path.join(rootDir, 'package.json'));
const releaseLocalDir = path.join(rootDir, 'release-local');
const args = process.argv.slice(2);
const platform = getArgValue('--platform') || detectPlatform();
const explicitDir = getArgValue('--dir');
const evidenceDir = explicitDir ? path.resolve(rootDir, explicitDir) : path.join(releaseLocalDir, platform);
const finalMode = hasFlag('--final');
const allowDirty = hasFlag('--allow-dirty');
const allowEmpty = hasFlag('--allow-empty');

function hasFlag(flag) { return args.includes(flag); }
function getArgValue(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
function detectPlatform() { if (process.platform === 'win32') return 'windows'; if (process.platform === 'darwin') return 'macos'; return 'linux'; }

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

function formatBool(value) { return value ? 'yes' : 'no'; }
function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index += 1; }
  return (index === 0 ? String(size) : size.toFixed(2)) + ' ' + units[index];
}
function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

function readJson(file, issues) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { issues.push('metadata.json could not be read: ' + (error && error.message ? error.message : String(error))); return null; }
}

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath, files); else files.push(fullPath);
  }
  return files;
}

function directoryStats(dir) {
  const files = walk(dir).filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  return { fileCount: files.length, sizeBytes: files.reduce((total, file) => total + fs.statSync(file).size, 0) };
}

function readChecksumFile(file, issues) {
  const entries = new Map();
  if (!fs.existsSync(file)) { issues.push('SHA256SUMS.txt is missing.'); return entries; }
  const contents = fs.readFileSync(file, 'utf8').trim();
  if (!contents) return entries;
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    if (!match) { issues.push('Invalid checksum line: ' + line); continue; }
    entries.set(match[2], match[1].toLowerCase());
  }
  return entries;
}

function checklistStats(file) {
  if (!fs.existsSync(file)) return { checked: 0, unchecked: 0, fieldsMissing: ['<checklist missing>'] };
  const contents = fs.readFileSync(file, 'utf8');
  const checked = contents.split(/\r?\n/).filter((line) => /^- \[x\]/i.test(line)).length;
  const unchecked = contents.split(/\r?\n/).filter((line) => /^- \[ \]/.test(line)).length;
  const labels = ['- Version:', '- Commit:', '- Platform:', '- Build type:', '- Signed artifacts:', '- Tester:', '- Date:'];
  const fieldsMissing = labels.filter((label) => {
    const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(label));
    return !line || line.slice(label.length).trim().length === 0;
  });
  return { checked, unchecked, fieldsMissing };
}

function signingStats(file) {
  if (!fs.existsSync(file)) return { verified: 0, applicable: 0, missing: true };
  const contents = fs.readFileSync(file, 'utf8');
  const verified = (contents.match(/\(verified\)/g) || []).length;
  const applicable = (contents.match(/Applicable: yes/g) || []).length;
  return { verified, applicable, missing: false };
}

function verifyEvidence(metadata, artifacts, stats) {
  const issues = [];
  if (!['windows', 'linux', 'macos'].includes(platform)) issues.push('Unsupported platform: ' + platform);
  const requiredFiles = ['metadata.json', 'SHA256SUMS.txt', 'README.md', 'RELEASE_NOTES.md', 'DESKTOP_SIGNATURES.md', 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md'];
  for (const file of requiredFiles) if (!fs.existsSync(path.join(evidenceDir, file))) issues.push(file + ' is missing.');
  if (!metadata) return issues;
  if (metadata.packageName !== packageJson.name) issues.push('metadata.json packageName mismatch: ' + metadata.packageName);
  if (metadata.version !== packageJson.version) issues.push('metadata.json version mismatch: ' + metadata.version + ' !== ' + packageJson.version);
  if (metadata.platform !== platform) issues.push('metadata.json platform mismatch: ' + metadata.platform + ' !== ' + platform);
  if (metadata.dirty && !allowDirty) issues.push('Working tree was dirty when evidence was created.');
  if (artifacts.length === 0 && !allowEmpty) issues.push('No desktop artifacts are listed in metadata.json.');

  const checksumEntries = readChecksumFile(path.join(evidenceDir, 'SHA256SUMS.txt'), issues);
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
  return issues;
}

function main() {
  if (hasFlag('--help')) { console.log(usage()); return; }
  const bootstrapIssues = [];
  if (!fs.existsSync(evidenceDir) || !fs.statSync(evidenceDir).isDirectory()) bootstrapIssues.push('Evidence directory not found: ' + evidenceDir);
  const metadata = bootstrapIssues.length ? null : readJson(path.join(evidenceDir, 'metadata.json'), bootstrapIssues);
  const artifacts = Array.isArray(metadata?.artifacts) ? metadata.artifacts : [];
  const checklist = checklistStats(path.join(evidenceDir, 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md'));
  const signing = signingStats(path.join(evidenceDir, 'DESKTOP_SIGNATURES.md'));
  const issues = bootstrapIssues.concat(bootstrapIssues.length ? [] : verifyEvidence(metadata, artifacts, checklist));
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
