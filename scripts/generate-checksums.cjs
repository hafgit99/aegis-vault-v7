const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const name = path.join(dir, file);
    if (fs.statSync(name).isDirectory()) {
      // Avoid scanning inside macOS .app folders
      if (path.extname(name).toLowerCase() !== '.app') {
        getFiles(name, fileList);
      }
    } else {
      const ext = path.extname(name).toLowerCase();
      // Hash files only, targeting final distributables
      if (['.exe', '.msi', '.dmg', '.deb', '.appimage', '.zip', '.gz'].includes(ext)) {
        // Exclude intermediate rust build artifacts (like target/release/deps/*.exe)
        if (!name.includes('/deps/') && !name.includes('\\deps\\') && !name.includes('/incremental/') && !name.includes('\\incremental\\')) {
          fileList.push(name);
        }
      }
    }
  }
  return fileList;
}

function isFinalArtifact(filePath) {
  const normalized = filePath.replaceAll('\\', '/');
  const ext = path.extname(filePath).toLowerCase();

  if (!normalized.includes('/release/')) return false;
  if (normalized.includes('/release/deps/')) return false;
  if (normalized.includes('/release/build/')) return false;
  if (normalized.includes('/release/incremental/')) return false;

  if (normalized.includes('/release/bundle/msi/')) return ext === '.msi';
  if (normalized.includes('/release/bundle/nsis/')) return ext === '.exe';
  if (normalized.includes('/release/bundle/dmg/')) return ext === '.dmg';
  if (normalized.includes('/release/bundle/deb/')) return ext === '.deb';
  if (normalized.includes('/release/bundle/appimage/')) return ext === '.appimage';

  const releaseDir = path.join(targetDir, 'release');
  const relativeToRelease = path.relative(releaseDir, filePath);
  const isTopLevelReleaseFile = relativeToRelease && !relativeToRelease.includes(path.sep);

  return isTopLevelReleaseFile && ext === (process.platform === 'win32' ? '.exe' : '');
}

const targetDir = path.resolve(__dirname, '../src-tauri/target');
if (!fs.existsSync(targetDir)) {
  console.log('Target directory does not exist. Skipping checksum generation.');
  process.exit(0);
}

console.log('Scanning for built artifacts in:', targetDir);
const filesToHash = getFiles(targetDir).filter(isFinalArtifact);

if (filesToHash.length === 0) {
  console.log('No final build artifacts found to hash.');
  process.exit(0);
}

let output = '';
for (const file of filesToHash) {
  const fileBuffer = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const filename = path.basename(file);
  console.log(`${hash}  ${filename}`);
  output += `${hash}  ${filename}\n`;
}

const outputPath = path.join(targetDir, 'SHA256SUMS.txt');
fs.writeFileSync(outputPath, output, 'utf8');
console.log('Checksums successfully written to:', outputPath);
