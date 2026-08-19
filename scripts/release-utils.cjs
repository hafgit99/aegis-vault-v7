const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─── CLI argument helpers ────────────────────────────────────────────────────

function hasFlag(args, flag) {
  return args.includes(flag);
}

function getArgValue(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

// ─── Platform helpers ────────────────────────────────────────────────────────

function detectPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

const DESKTOP_PLATFORMS = ['windows', 'linux', 'macos'];

function assertPlatform(value, failFn = failThrow) {
  if (!DESKTOP_PLATFORMS.includes(value)) {
    failFn('Unsupported desktop release platform: ' + value);
  }
}

// ─── Reporting helpers ───────────────────────────────────────────────────────

function pass(message) {
  console.log('PASS ' + message);
}

function warn(message) {
  console.log('WARN ' + message);
}

function failExit(message) {
  console.log('FAIL ' + message);
  process.exitCode = 1;
}

function failThrow(message) {
  throw new Error(message);
}

// ─── Version helpers ─────────────────────────────────────────────────────────

function normalizeVersion(version) {
  const parts = String(version || '')
    .trim()
    .split('.')
    .map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => !Number.isFinite(part))) return String(version || '').trim();

  while (parts.length > 3 && parts[parts.length - 1] === 0) {
    parts.pop();
  }

  return parts.join('.');
}

// ─── File / JSON helpers ─────────────────────────────────────────────────────

function readJson(file, failFn = failThrow) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    failFn('Failed to read JSON file ' + file + ': ' + (error && error.message ? error.message : String(error)));
  }
}

function readJsonSafe(file, issues) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    issues.push('metadata.json could not be read: ' + (error && error.message ? error.message : String(error)));
    return null;
  }
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ─── Filesystem helpers ──────────────────────────────────────────────────────

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
  const files = walk(dir).filter((file) => fs.existsSync(file) && fs.statSync(file).isFile());
  return {
    fileCount: files.length,
    sizeBytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

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

function shortHash(value) {
  return typeof value === 'string' && value.length >= 12 ? value.slice(0, 12) : value;
}

function formatBool(value) {
  return value ? 'yes' : 'no';
}

function firstMatch(text, patterns, fallback = '') {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  for (const pattern of list) {
    const value = String(text || '').match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return fallback;
}

// ─── Checklist helpers ───────────────────────────────────────────────────────

function checklistStats(file, labels) {
  if (!fs.existsSync(file)) return { checked: 0, unchecked: 0, fieldsMissing: ['<checklist missing>'] };
  const contents = fs.readFileSync(file, 'utf8');
  const checked = contents.split(/\r?\n/).filter((line) => /^- \[x\]/i.test(line)).length;
  const unchecked = contents.split(/\r?\n/).filter((line) => /^- \[ \]/.test(line)).length;
  const fieldsMissing = labels.filter((label) => {
    const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(label));
    return !line || line.slice(label.length).trim().length === 0;
  });
  return { checked, unchecked, fieldsMissing };
}

function checklistField(contents, label) {
  const line = contents.split(/\r?\n/).find((candidate) => candidate.startsWith(label));
  return line ? line.slice(label.length).trim() : '';
}

function isPlaceholderValue(value) {
  return !value || /^(blocked|n\/?a|na|none|tbd|todo|pending|-|<.*>)$/i.test(value.trim());
}

// ─── Checksum helpers ────────────────────────────────────────────────────────

function readChecksumFile(file, options = {}) {
  const { issues = null, failFn = failThrow, normalizeKey = (key) => key } = options;
  const entries = new Map();
  if (!fs.existsSync(file)) {
    const message = path.basename(file) + ' is missing.';
    if (issues) {
      issues.push(message);
      return entries;
    }
    failFn(message);
  }
  const contents = fs.readFileSync(file, 'utf8').trim();
  if (!contents) return entries;

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([a-f0-9]{64})\s{2}(.+)$/i);
    if (!match) {
      const message = 'Invalid checksum line: ' + line;
      if (issues) {
        issues.push(message);
        continue;
      }
      failFn(message);
    }
    entries.set(normalizeKey(match[2]), match[1].toLowerCase());
  }
  return entries;
}

module.exports = {
  hasFlag,
  getArgValue,
  detectPlatform,
  DESKTOP_PLATFORMS,
  assertPlatform,
  pass,
  warn,
  failExit,
  failThrow,
  normalizeVersion,
  readJson,
  readJsonSafe,
  readText,
  sha256,
  walk,
  directoryStats,
  formatBytes,
  shortHash,
  formatBool,
  firstMatch,
  checklistStats,
  checklistField,
  isPlaceholderValue,
  readChecksumFile,
};
