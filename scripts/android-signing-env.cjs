const fs = require('fs');
const path = require('path');

const signingEnvFile = path.resolve(__dirname, '..', '.secrets', 'android-signing.env');

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const index = trimmed.indexOf('=');
  if (index <= 0) return null;

  const key = trimmed.slice(0, index).trim();
  let value = trimmed.slice(index + 1).trim();
  if (!/^[A-Z0-9_]+$/.test(key)) return null;

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    value = value.slice(1, -1);
  }

  return [key, value];
}

function loadAndroidSigningEnv(options = {}) {
  const file = options.file ? path.resolve(options.file) : signingEnvFile;
  const loaded = [];
  const skipped = [];

  if (!fs.existsSync(file)) {
    return { file, exists: false, loaded, skipped };
  }

  const contents = fs.readFileSync(file, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    const [key, value] = parsed;
    if (process.env[key]) {
      skipped.push(key);
      continue;
    }
    process.env[key] = value;
    loaded.push(key);
  }

  return { file, exists: true, loaded, skipped };
}

module.exports = {
  loadAndroidSigningEnv,
  signingEnvFile,
};
