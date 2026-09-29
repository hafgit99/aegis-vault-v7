/*
 * Prepares the version-less copies the website links to, in a directory the
 * user can upload to the server's /downloads/ path.
 *
 * The website links Windows downloads by a fixed name so it never needs an edit
 * per release. The files themselves carry the real version, and the checksum
 * manifest is rewritten to match the names that are actually published --
 * otherwise the verification instructions on the page compare a digest against
 * a filename that does not exist.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join('release-local', 'windows');
const OUT = path.join('release-local', 'downloads-staging');

const ALIASES = {
  'KalderaShield7-7.0.16.0-windows-x64-setup.exe': 'KalderaShield7-latest-windows-x64-setup.exe',
  'KalderaShield7-7.0.16.0-windows-x64.msi': 'KalderaShield7-latest-windows-x64.msi',
  'KalderaShield7-7.0.16.0-windows-x64-portable.exe': 'KalderaShield7-latest-windows-x64-portable.exe',
};

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const manifest = [];
for (const [source, alias] of Object.entries(ALIASES)) {
  const from = path.join(SRC, source);
  if (!fs.existsSync(from)) {
    console.error('missing: ' + source + ' (run npm run release:local first)');
    process.exit(1);
  }
  const bytes = fs.readFileSync(from);
  fs.writeFileSync(path.join(OUT, alias), bytes);
  const digest = crypto.createHash('sha256').update(bytes).digest('hex');
  manifest.push(digest + '  ' + alias);
  console.log(alias + '  ' + bytes.length.toLocaleString() + ' B  ' + digest.slice(0, 16) + '...');
}

fs.writeFileSync(path.join(OUT, 'SHA256SUMS.txt'), manifest.join('\n') + '\n', 'utf8');

console.log('\nwrote ' + (manifest.length + 1) + ' files to ' + OUT);
console.log('\nUpload the whole directory contents to the web root\'s downloads/ path:');
console.log('  ' + OUT);
