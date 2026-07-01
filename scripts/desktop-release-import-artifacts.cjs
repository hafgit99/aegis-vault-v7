const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const platform = getArgValue('--platform');
const sourceArg = getArgValue('--source');
const releaseLocalDir = path.join(rootDir, 'release-local');

function hasFlag(flag) { return args.includes(flag); }
function getArgValue(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; }
function usage() {
  return [
    'Desktop release artifact importer',
    '',
    'Usage:',
    '  npm run desktop:release:import -- --platform <linux|macos> --source <extracted-artifact-dir>',
    '',
    'The source directory must be an extracted GitHub Actions artifact containing metadata.json,',
    'SHA256SUMS.txt, README.md, RELEASE_NOTES.md, DESKTOP_SIGNATURES.md, and artifacts.',
    '',
    'Options:',
    '  --platform <linux|macos|windows>  Destination evidence platform.',
    '  --source <dir>                    Extracted artifact directory to import.',
    '  --help                            Show this help.',
  ].join('\n');
}
function fail(message) { throw new Error(message); }
function assertPlatform(value) {
  if (!['windows', 'linux', 'macos'].includes(value || '')) fail('Unsupported or missing platform: ' + (value || '<missing>'));
}
function assertSource(value) {
  if (!value) fail('Missing --source <dir>.');
  const source = path.resolve(rootDir, value);
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) fail('Source directory not found: ' + source);
  return source;
}
function findEvidenceRoot(source) {
  const directMetadata = path.join(source, 'metadata.json');
  if (fs.existsSync(directMetadata)) return source;

  const candidates = [];
  function walk(dir, depth = 0) {
    if (depth > 4) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = path.join(dir, entry.name);
      if (fs.existsSync(path.join(child, 'metadata.json'))) candidates.push(child);
      walk(child, depth + 1);
    }
  }
  walk(source);
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) fail('Multiple evidence roots found under source. Pass the exact folder containing metadata.json: ' + candidates.join(', '));
  fail('metadata.json was not found under source: ' + source);
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail('Failed to read ' + file + ': ' + (error && error.message ? error.message : String(error))); }
}
function ensureRequiredFiles(evidenceRoot) {
  const required = ['metadata.json', 'SHA256SUMS.txt', 'README.md', 'RELEASE_NOTES.md', 'DESKTOP_SIGNATURES.md', 'DESKTOP_MANUAL_SMOKE_CHECKLIST.md'];
  const missing = required.filter((name) => !fs.existsSync(path.join(evidenceRoot, name)));
  if (missing.length) fail('Source evidence is missing required files: ' + missing.join(', '));
}
function copyEvidence(source, destination) {
  const sourceResolved = path.resolve(source);
  const destinationResolved = path.resolve(destination);
  if (sourceResolved === destinationResolved) return;
  fs.rmSync(destinationResolved, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(destinationResolved), { recursive: true });
  fs.cpSync(sourceResolved, destinationResolved, { recursive: true });
}

if (hasFlag('--help')) {
  console.log(usage());
  process.exit(0);
}

assertPlatform(platform);
const source = assertSource(sourceArg);
const evidenceRoot = findEvidenceRoot(source);
ensureRequiredFiles(evidenceRoot);
const metadata = readJson(path.join(evidenceRoot, 'metadata.json'));
if (metadata.platform !== platform) fail('Source metadata platform mismatch: ' + metadata.platform + ' !== ' + platform);

const destination = path.join(releaseLocalDir, platform);
copyEvidence(evidenceRoot, destination);

console.log('Imported desktop release evidence');
console.log('Platform: ' + platform);
console.log('Source: ' + path.relative(rootDir, evidenceRoot));
console.log('Destination: ' + path.relative(rootDir, destination));
console.log('Commit: ' + metadata.commit);
console.log('Artifacts: ' + (Array.isArray(metadata.artifacts) ? metadata.artifacts.length : 0));
console.log('Next: npm run desktop:release:evidence:summary -- --platform ' + platform);
