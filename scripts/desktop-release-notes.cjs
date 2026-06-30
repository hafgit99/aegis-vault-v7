const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const releaseLocalDir = path.join(rootDir, 'release-local');
const packageJson = require(path.join(rootDir, 'package.json'));
const args = process.argv.slice(2);

const platform = getArgValue('--platform') || detectPlatform();
const explicitDir = getArgValue('--dir');
const evidenceDir = explicitDir ? path.resolve(rootDir, explicitDir) : path.join(releaseLocalDir, platform);
const signed = hasFlag('--signed');
const channel = getArgValue('--channel') || 'internal candidate';

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
    'Desktop release notes generator',
    '',
    'Usage:',
    '  npm run desktop:release:notes -- [options]',
    '',
    'Options:',
    '  --platform <windows|linux|macos>  Evidence platform. Defaults to host platform.',
    '  --dir <path>                       Evidence directory. Defaults to release-local/<platform>.',
    '  --channel <name>                  Release channel label. Defaults to internal candidate.',
    '  --signed                          Mark artifacts as signed in the generated notes.',
    '  --help                            Show this help.',
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

function shortHash(value) {
  return typeof value === 'string' && value.length >= 12 ? value.slice(0, 12) : value;
}

function artifactKind(name) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.msi')) return 'Windows MSI installer';
  if (lower.includes('setup') && lower.endsWith('.exe')) return 'Windows setup installer';
  if (lower.endsWith('.exe')) return 'Windows portable executable';
  if (lower.endsWith('.deb')) return 'Linux deb package';
  if (lower.endsWith('.appimage')) return 'Linux AppImage';
  if (lower.endsWith('.dmg')) return 'macOS disk image';
  if (lower.endsWith('.xpi')) return 'Firefox signed extension';
  if (lower.endsWith('.app')) return 'macOS app bundle';
  return 'Release artifact';
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return 'unknown size';
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return (index === 0 ? String(size) : size.toFixed(2)) + ' ' + units[index];
}

function checksumLines(artifacts) {
  return artifacts
    .filter(artifact => artifact.type === 'file' && artifact.sha256)
    .map(artifact => '- `' + artifact.name + '` - `' + artifact.sha256 + '`');
}

function artifactLines(artifacts) {
  if (artifacts.length === 0) return ['- No copied artifacts were recorded.'];
  return artifacts.map((artifact) => {
    const details = [artifactKind(artifact.name), formatBytes(artifact.sizeBytes)];
    if (artifact.type === 'directory') details.push(String(artifact.fileCount || 0) + ' files');
    return '- `' + artifact.name + '` - ' + details.join(', ');
  });
}

function generateReleaseNotes() {
  assertPlatform(platform);
  const metadataPath = path.join(evidenceDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    fail('metadata.json not found. Run release evidence collection before generating notes: ' + metadataPath);
  }

  const metadata = readJson(metadataPath);
  const artifacts = Array.isArray(metadata.artifacts) ? metadata.artifacts : [];
  if (metadata.packageName !== packageJson.name) {
    fail('metadata.json packageName mismatch: ' + metadata.packageName);
  }
  if (metadata.version !== packageJson.version) {
    fail('metadata.json version mismatch: ' + metadata.version + ' !== ' + packageJson.version);
  }

  const checksums = checksumLines(artifacts);
  const notes = [
    '# Aegis Vault 7 ' + metadata.version + ' Desktop Release Notes',
    '',
    'Channel: ' + channel,
    'Platform: ' + metadata.platform,
    'Commit: ' + metadata.commit + ' (' + shortHash(metadata.commit) + ')',
    'Created: ' + metadata.createdAt,
    'Working tree clean: ' + (metadata.dirty ? 'no' : 'yes'),
    'Artifact signing: ' + (signed ? 'signed artifacts verified by release owner' : 'not verified by this generator'),
    '',
    '## Highlights',
    '',
    '- Local-first encrypted vault for desktop use.',
    '- Release candidate produced through the desktop release gate.',
    '- Evidence folder includes metadata, SHA-256 checksums, and the manual smoke checklist.',
    '',
    '## Artifacts',
    '',
    ...artifactLines(artifacts),
    '',
    '## SHA-256 Checksums',
    '',
    ...(checksums.length > 0 ? checksums : ['- No file artifact checksums were recorded.']),
    '',
    '## Verification Before Publishing',
    '',
    '- Confirm `metadata.json` reports `dirty: false` for public/shareable builds.',
    '- Confirm `SHA256SUMS.txt` matches every published artifact.',
    '- Complete `DESKTOP_MANUAL_SMOKE_CHECKLIST.md` for the candidate platform.',
    '- Publish signed artifacts only when the release channel is public.',
    '',
    '## Recovery And Safety Notes',
    '',
    '- Aegis Vault 7 cannot recover a lost master password.',
    '- Keep the Emergency Kit and Account Secret Key offline and separate from the device.',
    '- Encrypted `.aegis` backups require the backup password.',
    '- Plain JSON backups are unsafe and should only be stored offline in a trusted location.',
    '- Local malware, OS compromise, and untrusted builds remain outside the app protection boundary.',
    '',
    '## Evidence Files',
    '',
    '- `metadata.json`',
    '- `SHA256SUMS.txt`',
    '- `DESKTOP_MANUAL_SMOKE_CHECKLIST.md`',
    '- `README.md`',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(evidenceDir, 'RELEASE_NOTES.md'), notes, 'utf8');
  console.log('Desktop release notes written to ' + path.relative(rootDir, path.join(evidenceDir, 'RELEASE_NOTES.md')));
}

if (hasFlag('--help')) {
  console.log(usage());
  process.exit(0);
}

generateReleaseNotes();
