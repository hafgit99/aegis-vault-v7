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
const processWaitTimeoutMs = 15000;
const processPollIntervalMs = 500;

function run(args, options = {}) {
  const output = execFileSync(adb, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });

  return typeof output === 'string' ? output.trim() : '';
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function tryRun(args) {
  try {
    return run(args);
  } catch {
    return '';
  }
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

  const pid = waitForPid();
  if (!pid) {
    printRecentCrashLog();
    throw new Error(`${packageName} is installed but not running after ${processWaitTimeoutMs}ms.`);
  }

  assertAppPrivateDataDir();
  console.log(`${packageName} is running with pid ${pid}.`);
}

function waitForPid() {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= processWaitTimeoutMs) {
    const pid = tryRun(['shell', 'pidof', packageName]);
    if (pid) return pid;
    sleep(processPollIntervalMs);
  }

  return '';
}

function assertAppPrivateDataDir() {
  const packageDump = run(['shell', 'dumpsys', 'package', packageName]);
  const dataDirMatch = packageDump.match(/dataDir=(\S+)/);
  const dataDir = dataDirMatch?.[1] || '';
  const expectedPrefix = `/data/user/0/${packageName}`;

  if (!dataDir.startsWith(expectedPrefix)) {
    throw new Error(`${packageName} dataDir is not app-private: ${dataDir || 'unknown'}`);
  }

  console.log(`${packageName} app-private dataDir verified: ${dataDir}`);
}

function printRecentCrashLog() {
  const logs = tryRun(['logcat', '-d', '-t', '250']);
  const relevant = logs
    .split(/\r?\n/)
    .filter((line) => (
      line.includes(packageName)
      || line.includes('FATAL EXCEPTION')
      || line.includes('AndroidRuntime')
      || line.includes('Tauri')
    ))
    .slice(-80)
    .join('\n');

  if (relevant) {
    console.error('Recent Android crash/runtime log excerpt:');
    console.error(relevant);
  }
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
