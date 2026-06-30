const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadAndroidSigningEnv } = require('./android-signing-env.cjs');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const signed = args.has('--signed');
const device = args.has('--device');
const skipBuild = args.has('--skip-build');
const skipAndroidBuild = args.has('--skip-android-build');
const skipDevice = args.has('--skip-device') || !device;
const evidence = args.has('--evidence');
const enableAutofill = args.has('--enable-autofill');
const allowDirty = args.has('--allow-dirty');
const freshInstall = args.has('--fresh-install');

function printHelp() {
  console.log(`Android release gate

Usage:
  node scripts/android-release-gate.cjs [options]

Options:
  --signed              Require Android release signing env and build release APK.
  --device              Diagnose, install, launch, and smoke-test the current debug APK on USB device.
  --skip-build          Skip lint and web build.
  --skip-android-build  Skip Android APK build.
  --skip-device         Skip device smoke even when --device is present.
  --evidence            Copy APK/AAB artifacts and release report under release-local/android.
  --enable-autofill     Try to re-enable Aegis as Android Autofill provider after APK install.
  --fresh-install       Uninstall the selected Android package before device smoke install.
  --allow-dirty         Allow evidence export from a dirty working tree.
  --help                Show this help.
`);
}

if (args.has('--help') || args.has('-h')) {
  printHelp();
  process.exit(0);
}

function existingDir(candidate) {
  return candidate && fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
}

function latestSubdir(parent) {
  if (!existingDir(parent)) return '';
  return fs.readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(parent, entry.name))
    .sort()
    .reverse()[0] || '';
}

function androidEnv() {
  const env = { ...process.env };

  if (process.platform === 'win32') {
    const androidStudioJbr = 'C:\\Program Files\\Android\\Android Studio\\jbr';
    const sdkRoot = path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');

    if (!env.JAVA_HOME && existingDir(androidStudioJbr)) {
      env.JAVA_HOME = androidStudioJbr;
    }

    if (!env.ANDROID_HOME && existingDir(sdkRoot)) {
      env.ANDROID_HOME = sdkRoot;
    }

    if (!env.ANDROID_SDK_ROOT && env.ANDROID_HOME) {
      env.ANDROID_SDK_ROOT = env.ANDROID_HOME;
    }

    if (!env.NDK_HOME && env.ANDROID_HOME) {
      const ndkHome = latestSubdir(path.join(env.ANDROID_HOME, 'ndk'));
      if (ndkHome) env.NDK_HOME = ndkHome;
    }
  }

  return env;
}

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: androidEnv(),
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const signingEnv = loadAndroidSigningEnv();
if (signed && signingEnv.exists) {
  console.log(`Loaded local signing env: ${path.relative(repoRoot, signingEnv.file)}`);
}

console.log(signed
  ? 'Running signed Android release candidate gate.'
  : 'Running internal Android release candidate gate.');

if (!skipBuild) {
  run('npm', ['run', 'lint']);
  run('npm', ['run', 'android:release:version:check']);
  run('npm', ['run', 'build']);
}

if (signed) {
  run('npm', ['run', 'android:release:signing:check']);
}

if (!skipAndroidBuild) {
  run('npm', ['run', signed ? 'android:build:apk:aarch64' : 'android:build:apk:debug:aarch64']);
}

run('npm', ['run', 'android:release:report', '--', '--strict', ...(signed ? ['--signed'] : [])]);

if (!skipDevice) {
  const deviceModeArgs = [
    ...(signed ? ['--release'] : []),
    ...(freshInstall ? ['--fresh-install'] : []),
  ];
  const deviceDoctorArgs = signed ? ['--release'] : [];
  run('npm', ['run', 'android:device:doctor', '--', ...deviceDoctorArgs]);
  run('npm', ['run', 'android:device:smoke', '--', ...deviceModeArgs]);
  run('npm', ['run', 'android:device:security', '--', '--launch', ...deviceDoctorArgs]);
  if (enableAutofill) {
    run('npm', ['run', 'android:device:doctor', '--', '--enable-autofill', ...deviceDoctorArgs]);
  }
}

if (evidence) {
  run('npm', [
    'run',
    'android:release:evidence',
    '--',
    ...(allowDirty ? ['--allow-dirty'] : []),
    ...(!skipDevice ? ['--device'] : []),
    ...(enableAutofill ? ['--enable-autofill'] : []),
    ...(freshInstall ? ['--fresh-install'] : []),
    ...(signed ? ['--signed'] : []),
  ]);

  run('npm', [
    'run',
    'android:release:evidence:verify',
    '--',
    ...(allowDirty ? ['--allow-dirty'] : []),
    ...(!skipDevice ? ['--require-device'] : []),
    ...(freshInstall ? ['--require-fresh-install'] : []),
    ...(signed ? ['--require-signed'] : []),
  ]);
}

console.log('\nAndroid release gate completed.');
