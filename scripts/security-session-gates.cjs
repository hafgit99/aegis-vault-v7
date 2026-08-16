const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const findings = [];

function readText(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

function collectFiles(dir, extensions, out = []) {
  const absolute = path.join(rootDir, dir);
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') continue;
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(rel, extensions, out);
      continue;
    }
    if (extensions.some((ext) => entry.name.endsWith(ext))) {
      out.push(rel);
    }
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

const authorizedFiles = [
  path.normalize('src/lib/storage.ts'),
  path.normalize('src/components/SettingsPanel.tsx'),
  path.normalize('src/components/settings/SettingsRecoverySection.tsx'),
  path.normalize('src/lib/vaultSession.ts')
];

const sensitiveCallbacks = [
  'withActiveAccountSecretKey',
  'withActiveBackupPassword',
  'withActiveSessionSecrets'
];

for (const file of collectFiles('src', ['.tsx', '.ts', '.jsx', '.js'])) {
  if (/\.(test|spec)\.[tj]sx?$/.test(file)) continue;

  const normalizedFile = path.normalize(file);
  if (authorizedFiles.some(auth => normalizedFile.endsWith(auth))) {
    continue;
  }

  const text = readText(file);
  for (const callback of sensitiveCallbacks) {
    const regex = new RegExp('\\b' + callback + '\\b', 'g');
    let match;
    while ((match = regex.exec(text))) {
      findings.push(`${file}:${lineOf(text, match.index)}: Unauthorized usage of sensitive session callback "${callback}"`);
    }
  }
}

if (findings.length > 0) {
  console.error('Session callback authorization check failed:');
  for (const finding of findings) {
    console.error(' - ' + finding);
  }
  process.exit(1);
}

console.log('PASS: All active session callback invocations are restricted to authorized files.');
