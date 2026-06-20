const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const required = [
  'AEGIS_ANDROID_KEYSTORE_PATH',
  'AEGIS_ANDROID_KEY_ALIAS',
  'AEGIS_ANDROID_KEYSTORE_PASSWORD',
  'AEGIS_ANDROID_KEY_PASSWORD',
];

function env(name) {
  return process.env[name] || '';
}

function fail(message) {
  console.log(`FAIL ${message}`);
  process.exitCode = 1;
}

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.log(`WARN ${message}`);
}

console.log('Android release signing readiness');

for (const name of required) {
  if (env(name)) {
    pass(`${name} is set`);
  } else {
    fail(`${name} is missing`);
  }
}

const keystorePath = env('AEGIS_ANDROID_KEYSTORE_PATH');
if (keystorePath) {
  const resolved = path.resolve(keystorePath);
  if (fs.existsSync(resolved)) {
    pass('keystore file exists');
  } else {
    fail(`keystore file does not exist: ${resolved}`);
  }

  const relativeToRepo = path.relative(repoRoot, resolved);
  const isInsideRepo = relativeToRepo === '' || (!relativeToRepo.startsWith('..') && !path.isAbsolute(relativeToRepo));
  const normalizedRelative = relativeToRepo.split(path.sep).join('/');
  const isIgnoredSecretsPath = normalizedRelative.startsWith('.secrets/');
  if (isInsideRepo && isIgnoredSecretsPath) {
    warn('keystore file is inside the local .secrets folder; acceptable for local builds only if it remains ignored and backed up separately');
  } else if (isInsideRepo) {
    fail('keystore file is inside the repository; move it outside the repo or into ignored .secrets before release');
  } else {
    pass('keystore file is outside the repository');
  }

}
const ignoredPatterns = fs.readFileSync(path.join(repoRoot, '.gitignore'), 'utf8');
for (const pattern of ['.secrets/', '*.keystore', '*.jks', '*.p12', '*.pfx', 'keystore.properties', 'key.properties']) {
  if (ignoredPatterns.includes(pattern)) {
    pass(`${pattern} is ignored`);
  } else {
    fail(`${pattern} is not ignored`);
  }
}

if (
  env('AEGIS_ANDROID_KEYSTORE_PASSWORD') &&
  env('AEGIS_ANDROID_KEY_PASSWORD') &&
  env('AEGIS_ANDROID_KEYSTORE_PASSWORD') === env('AEGIS_ANDROID_KEY_PASSWORD')
) {
  warn('key password matches keystore password; this is valid, but separate passwords are preferable for public release keys');
}

console.log('\nRequired local build variables:');
for (const name of required) {
  const value = env(name) ? (name.includes('PASSWORD') ? '<redacted>' : env(name)) : '<missing>';
  console.log(`  ${name}=${value}`);
}
