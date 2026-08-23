const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { pass, warn, failExit: fail } = require('./release-utils.cjs');
const { loadAndroidSigningEnv } = require('./android-signing-env.cjs');

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

function keytoolExecutable() {
  const javaHome = process.env.JAVA_HOME || '';
  const fromJavaHome = javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'keytool.exe' : 'keytool') : '';
  if (fromJavaHome && fs.existsSync(fromJavaHome)) return fromJavaHome;

  const androidStudioJbr = process.platform === 'win32'
    ? path.join('C:\\', 'Program Files', 'Android', 'Android Studio', 'jbr', 'bin', 'keytool.exe')
    : '';
  if (androidStudioJbr && fs.existsSync(androidStudioJbr)) return androidStudioJbr;

  return process.platform === 'win32' ? 'keytool.exe' : 'keytool';
}

function detectStoreType(file) {
  const ext = path.extname(file).toLowerCase();
  return ext === '.p12' || ext === '.pfx' ? 'PKCS12' : undefined;
}

function validateKeystore(resolved) {
  const alias = env('AEGIS_ANDROID_KEY_ALIAS');
  const storePassword = env('AEGIS_ANDROID_KEYSTORE_PASSWORD');
  if (!alias || !storePassword || !fs.existsSync(resolved)) return;

  // Pass password safely via environment variable reference to avoid exposing secrets in process lists
  const args = ['-list', '-keystore', resolved, '-storepass:env', 'AEGIS_ANDROID_KEYSTORE_PASSWORD', '-alias', alias];
  const storeType = detectStoreType(resolved);
  if (storeType) args.push('-storetype', storeType);

  try {
    execFileSync(keytoolExecutable(), args, {
      cwd: repoRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        AEGIS_ANDROID_KEYSTORE_PASSWORD: storePassword,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    });
    pass('keystore password opens the store and alias is present');
  } catch (error) {
    const output = String(error.stderr || error.stdout || error.message || '');
    if (/password was incorrect|Keystore was tampered|Password verification failed|keystore password was incorrect/i.test(output)) {
      fail('keystore password could not open the signing store; update AEGIS_ANDROID_KEYSTORE_PASSWORD');
    } else if (/Alias .* does not exist|Cannot find alias/i.test(output)) {
      fail(`key alias was not found in the keystore: ${alias}`);
    } else {
      fail('keytool could not validate the signing keystore; run with the same Java/JDK used by Android Studio');
    }
  }
}

const signingEnv = loadAndroidSigningEnv();

console.log('Android release signing readiness');
if (signingEnv.exists) {
  console.log(`Loaded local signing env: ${path.relative(repoRoot, signingEnv.file)}`);
  if (signingEnv.loaded.length > 0) console.log(`Loaded variables: ${signingEnv.loaded.join(', ')}`);
  if (signingEnv.skipped.length > 0) console.log(`Kept existing shell variables: ${signingEnv.skipped.join(', ')}`);
} else {
  console.log(`Local signing env not found: ${path.relative(repoRoot, signingEnv.file)}`);
}

for (const name of required) {
  const value = env(name);
  if (value) {
    pass(`${name} is set`);
    if (name.includes('PASSWORD') && /^<[^>]+>$/.test(value)) {
      warn(`${name} looks like an unedited template placeholder; remove angle brackets unless they are part of the real password`);
    }
  } else {
    fail(`${name} is missing`);
  }
}

const keystorePath = env('AEGIS_ANDROID_KEYSTORE_PATH');
if (keystorePath) {
  const resolved = path.resolve(keystorePath);
  if (fs.existsSync(resolved)) {
    pass('keystore file exists');
    validateKeystore(resolved);
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
