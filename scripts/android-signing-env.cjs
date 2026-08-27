const fs = require('fs');
const os = require('os');
const path = require('path');

// Legacy in-repo location (kept as a fallback for existing setups).
const signingEnvFile = path.resolve(__dirname, '..', '.secrets', 'android-signing.env');

// Preferred location: user profile directory OUTSIDE any cloud-synced folder.
const externalSigningEnvFile = path.join(os.homedir(), 'AegisVaultKeys', 'android-signing.env');

/**
 * Resolves the signing env file location:
 *  1. explicit `options.file`
 *  2. AEGIS_SIGNING_ENV_FILE environment variable
 *  3. ~/.AegisVaultKeys/android-signing.env (outside OneDrive/cloud sync — preferred)
 *  4. legacy <repo>/.secrets/android-signing.env (backward compatibility)
 */
function resolveSigningEnvFile(options = {}) {
  if (options.file) return path.resolve(options.file);
  const fromVar = process.env.AEGIS_SIGNING_ENV_FILE;
  if (fromVar) return path.resolve(fromVar);
  if (fs.existsSync(externalSigningEnvFile)) return externalSigningEnvFile;
  return signingEnvFile;
}

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
  const file = resolveSigningEnvFile(options);
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
  resolveSigningEnvFile,
  signingEnvFile,
  externalSigningEnvFile,
};
