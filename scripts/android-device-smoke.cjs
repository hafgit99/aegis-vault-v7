const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
const adb = sdkRoot ? path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
const apk = path.join(
  repoRoot,
  'src-tauri',
  'gen',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'universal',
  'debug',
  'app-universal-debug.apk',
);
const packageName = 'com.hafgit99.aegisvault7.debug';
const activityName = 'com.hafgit99.aegisvault7.MainActivity';

function run(args, options = {}) {
  const output = execFileSync(adb, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });

  return typeof output === 'string' ? output.trim() : '';
}

function listReadyDevices() {
  return run(['devices', '-l'])
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\sdevice\s/.test(line) || line.endsWith('\tdevice'));
}

function ensureReadyDevice() {
  const devices = listReadyDevices();
  if (devices.length === 0) {
    throw new Error('No authorized Android device found. Connect a device and approve USB debugging.');
  }
  console.log(`Android device ready: ${devices[0]}`);
}

function install() {
  if (!fs.existsSync(apk)) {
    throw new Error(`APK not found: ${path.relative(repoRoot, apk)}`);
  }
  console.log(`Installing ${path.relative(repoRoot, apk)}`);
  run(['install', '-r', apk], { stdio: 'inherit' });
}

function launch() {
  console.log(`Launching ${packageName}`);
  run(['shell', 'am', 'start', '-n', `${packageName}/${activityName}`], { stdio: 'inherit' });
}

function status() {
  const packages = run(['shell', 'pm', 'list', 'packages', packageName]);
  if (!packages.includes(packageName)) {
    throw new Error(`${packageName} is not installed.`);
  }

  const pid = run(['shell', 'pidof', packageName]);
  if (!pid) {
    throw new Error(`${packageName} is installed but not running.`);
  }

  console.log(`${packageName} is running with pid ${pid}.`);
}

const command = process.argv[2] || 'smoke';

ensureReadyDevice();

if (command === 'install') {
  install();
} else if (command === 'launch') {
  launch();
} else if (command === 'status') {
  status();
} else if (command === 'smoke') {
  install();
  launch();
  status();
} else {
  throw new Error(`Unknown command: ${command}`);
}
