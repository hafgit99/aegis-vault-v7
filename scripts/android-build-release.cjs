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

const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');

function run(command, commandArgs) {
  let executable = command;
  let args = commandArgs;

  if (command === 'npm') {
    if (fs.existsSync(npmCli)) {
      executable = process.execPath;
      args = [npmCli, ...commandArgs];
    } else {
      executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    }
  } else if (command === 'npx' || command === 'tauri') {
    if (fs.existsSync(npxCli)) {
      executable = process.execPath;
      args = [npxCli, ...(command === 'tauri' ? ['tauri', ...commandArgs] : commandArgs)];
    } else {
      executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      args = command === 'tauri' && process.platform === 'win32' ? ['tauri', ...commandArgs] : commandArgs;
    }
  }

  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
    shell: !fs.existsSync(npmCli) && process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

run('npm', ['run', 'android:clean:jni']);
run('tauri', ['android', 'build', '--apk', '--target', 'aarch64']);