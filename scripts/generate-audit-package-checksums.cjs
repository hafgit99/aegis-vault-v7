const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const CHECKSUM_FILE = 'SHA256SUMS.txt';
const EXCLUDE_NAMES = new Set([CHECKSUM_FILE, '.DS_Store', 'Thumbs.db', 'ehthumbs.db', 'desktop.ini']);

function hasFlag(flag) {
  return args.includes(flag);
}

function getArgValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function usage() {
  return [
    'Aegis Vault 7 - Security Audit Package checksum generator',
    '',
    'Generates or verifies SHA256SUMS.txt for the SECURITY_AUDIT_PACKAGE directory.',
    'The manifest uses the portable coreutils format: "<sha256>  <relative-path>".',
    '',
    'Usage:',
    '  npm run audit:checksums                Generate SECURITY_AUDIT_PACKAGE/SHA256SUMS.txt',
    '  npm run audit:checksums:verify         Verify an existing manifest',
    '  node scripts/generate-audit-package-checksums.cjs --dir <path>      Use a custom package dir',
    '  node scripts/generate-audit-package-checksums.cjs --verify --dir <path>',
    '',
    'Options:',
    '  --verify     Verify an existing SHA256SUMS.txt instead of generating one.',
    '  --dir <path> Target audit package directory. Defaults to SECURITY_AUDIT_PACKAGE.',
    '  --help       Show this help.',
  ].join('\n');
}

function defaultPackageDir() {
  return path.join(rootDir, 'SECURITY_AUDIT_PACKAGE');
}

function isExcluded(name) {
  if (EXCLUDE_NAMES.has(name)) return true;
  return name.toLowerCase().endsWith('.log');
}

function collectFiles(dir, base = dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, base, list);
    } else if (entry.isFile()) {
      if (isExcluded(entry.name)) continue;
      const rel = path.relative(base, full).split(path.sep).join('/');
      list.push(rel);
    }
  }
  return list;
}

function sha256File(absPath) {
  return crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
}

function gitInfo() {
  const run = (cmd) => {
    try {
      return execSync(cmd, { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch (_error) {
      return '';
    }
  };
  const commit = run('git --no-pager log -1 --format=%H');
  const short = run('git --no-pager log -1 --format=%h');
  const branch = run('git rev-parse --abbrev-ref HEAD');
  let dirty = false;
  try {
    const status = execSync('git status --porcelain', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    dirty = status.trim().length > 0;
  } catch (_error) {
    dirty = false;
  }
  return { commit, short, branch, dirty };
}

function generate(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error('Audit package directory not found: ' + dir);
    process.exit(1);
  }

  const files = collectFiles(dir).sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    console.error('No files found to hash in: ' + dir);
    process.exit(1);
  }

  let totalBytes = 0;
  const lines = [];
  for (const rel of files) {
    const abs = path.join(dir, rel);
    const stat = fs.statSync(abs);
    totalBytes += stat.size;
    const hash = sha256File(abs);
    lines.push(hash + '  ' + rel);
    console.log(hash + '  ' + rel);
  }

  const output = lines.join('\n') + '\n';
  const outPath = path.join(dir, CHECKSUM_FILE);
  fs.writeFileSync(outPath, output, 'utf8');

  const manifestHash = crypto.createHash('sha256').update(output).digest('hex');
  const info = gitInfo();
  const pkg = require(path.join(rootDir, 'package.json'));

  console.log('');
  console.log('Audit package checksum manifest generated:');
  console.log('  Manifest:            ' + path.relative(rootDir, outPath));
  console.log('  Version:             ' + pkg.version);
  console.log('  Files hashed:        ' + files.length);
  console.log('  Total size:          ' + totalBytes + ' bytes');
  console.log('  Generated (UTC):     ' + new Date().toISOString());
  console.log('  Git commit:          ' + (info.commit || '<unknown>') + (info.short ? ' (' + info.short + ')' : ''));
  console.log('  Git branch:          ' + (info.branch || '<unknown>'));
  console.log('  Working tree clean:  ' + (info.dirty ? 'no' : 'yes'));
  console.log('  Manifest fingerprint: ' + manifestHash);
  console.log('');
  console.log('Verification:');
  console.log('  Coreutils:   cd SECURITY_AUDIT_PACKAGE && sha256sum -c SHA256SUMS.txt');
  console.log('  Node verify: npm run audit:checksums:verify');
}

function verify(dir) {
  const sumPath = path.join(dir, CHECKSUM_FILE);
  if (!fs.existsSync(sumPath)) {
    console.error('Checksum manifest not found: ' + sumPath);
    process.exit(1);
  }

  const content = fs.readFileSync(sumPath, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  let ok = 0;
  let failed = 0;
  let missing = 0;
  let malformed = 0;

  for (const line of lines) {
    const match = line.match(/^([0-9a-fA-F]{64})\s{2}(.+)$/);
    if (!match) {
      console.error('[MALFORMED] ' + line);
      malformed += 1;
      failed += 1;
      continue;
    }
    const expected = match[1].toLowerCase();
    const rel = match[2];
    const abs = path.join(dir, rel);
    if (!fs.existsSync(abs)) {
      console.error('[MISSING]  ' + rel);
      missing += 1;
      failed += 1;
      continue;
    }
    const actual = sha256File(abs);
    if (actual === expected) {
      ok += 1;
    } else {
      console.error('[FAIL]     ' + rel);
      console.error('           expected ' + expected);
      console.error('           actual   ' + actual);
      failed += 1;
    }
  }

  console.log('');
  console.log('Verification summary: OK=' + ok + ' FAILED=' + failed + ' (missing=' + missing + ', malformed=' + malformed + ')');

  if (failed > 0) {
    console.error('Checksum verification FAILED.');
    process.exit(1);
  }
  console.log('Checksum verification PASSED.');
}

if (hasFlag('--help')) {
  console.log(usage());
  process.exit(0);
}

const dir = getArgValue('--dir') ? path.resolve(rootDir, getArgValue('--dir')) : defaultPackageDir();
const mode = hasFlag('--verify') ? 'verify' : 'generate';
console.log('Aegis Vault 7 - Security Audit Package checksum ' + mode);
console.log('Target: ' + path.relative(rootDir, dir));
console.log('');

if (mode === 'verify') {
  verify(dir);
} else {
  generate(dir);
}

