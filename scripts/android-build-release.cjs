const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadAndroidSigningEnv } = require('./android-signing-env.cjs');

const repoRoot = path.resolve(__dirname, '..');
const required = [
  'AEGIS_ANDROID_KEYSTORE_PATH',
  'AEGIS_ANDROID_KEY_ALIAS',
  'AEGIS_ANDROID_KEYSTORE_PASSWORD',
  'AEGIS_ANDROID_KEY_PASSWORD',
];

loadAndroidSigningEnv();

for (const name of required) {
  if (!process.env[name]) {
    throw new Error(`Signed Android build requires ${name}. Configure .secrets/android-signing.env first.`);
  }
}

const keystorePath = path.resolve(process.env.AEGIS_ANDROID_KEYSTORE_PATH);
if (!fs.existsSync(keystorePath)) {
  throw new Error(`Android signing keystore does not exist: ${keystorePath}`);
}

const env = { ...process.env };
const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const javaHome = env.JAVA_HOME || 'C:\\Program Files\\Android\\Android Studio\\jbr';
env.ANDROID_HOME = sdkRoot;
env.ANDROID_SDK_ROOT = env.ANDROID_SDK_ROOT || sdkRoot;
env.JAVA_HOME = javaHome;

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run('npm', ['run', 'android:clean:jni']);
run('tauri', ['android', 'build', '--apk', '--target', 'aarch64']);