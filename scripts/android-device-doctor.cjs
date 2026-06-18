const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
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
const autofillServiceName = 'com.hafgit99.aegisvault7/.AegisAutofillService';
let failed = false;

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  console.log(`WARN ${message}`);
}

function fail(message) {
  console.log(`FAIL ${message}`);
  failed = true;
}

function run(args) {
  return execFileSync(adb, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function tryRun(args) {
  try {
    return run(args);
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || error.message || ''}`.trim();
  }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function parseDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [serial, state] = line.split(/\s+/, 2);
      return { serial, state, raw: line };
    });
}

console.log('Android device doctor');

if (sdkRoot) {
  pass(`Android SDK configured: ${sdkRoot}`);
} else {
  warn('ANDROID_HOME/ANDROID_SDK_ROOT is not set; falling back to adb from PATH');
}

if (fs.existsSync(adb) || adb === 'adb') {
  pass(`adb resolved: ${adb}`);
} else {
  fail(`adb not found: ${adb}`);
}

if (fs.existsSync(apk)) {
  const stats = fs.statSync(apk);
  pass(`debug APK exists: ${path.relative(repoRoot, apk)}`);
  console.log(`INFO apk-size ${(stats.size / 1024 / 1024).toFixed(2)} MiB`);
  console.log(`INFO apk-sha256 ${sha256(apk)}`);
} else {
  fail(`debug APK not found: ${path.relative(repoRoot, apk)}`);
}

const devicesOutput = tryRun(['devices', '-l']);
const devices = parseDevices(devicesOutput);
const readyDevices = devices.filter((device) => device.state === 'device');

if (devices.length === 0) {
  fail('No Android device is visible to adb. Connect USB, enable USB debugging, and approve the RSA prompt.');
} else {
  devices.forEach((device) => {
    const label = device.state === 'device' ? 'authorized' : device.state;
    console.log(`INFO device ${label}: ${device.raw}`);
  });
}

if (readyDevices.length === 0) {
  fail('No authorized Android device is ready.');
} else {
  pass(`authorized Android device ready: ${readyDevices[0].serial}`);
}

if (readyDevices.length > 0) {
  const model = tryRun(['shell', 'getprop', 'ro.product.model']);
  const sdk = tryRun(['shell', 'getprop', 'ro.build.version.sdk']);
  const abi = tryRun(['shell', 'getprop', 'ro.product.cpu.abi']);
  console.log(`INFO device-model ${model || 'unknown'}`);
  console.log(`INFO device-sdk ${sdk || 'unknown'}`);
  console.log(`INFO device-abi ${abi || 'unknown'}`);

  const installedPackages = tryRun(['shell', 'pm', 'list', 'packages', packageName]);
  if (installedPackages.includes(packageName)) {
    pass(`${packageName} is installed`);

    const packageDump = tryRun(['shell', 'dumpsys', 'package', packageName]);
    const dataDir = packageDump.match(/dataDir=(\S+)/)?.[1] || '';
    const expectedDataDir = `/data/user/0/${packageName}`;
    if (dataDir.startsWith(expectedDataDir)) {
      pass(`app-private dataDir verified: ${dataDir}`);
    } else {
      fail(`app dataDir is not app-private: ${dataDir || 'unknown'}`);
    }

    if (packageDump.includes('AegisAutofillService')) {
      pass('Aegis Autofill service is declared in installed package');
    } else {
      fail('Aegis Autofill service is missing from installed package dump');
    }
  } else {
    warn(`${packageName} is not installed yet; run npm run android:device:install or android:release:gate -- --device`);
  }

  const autofillSetting = tryRun(['shell', 'settings', 'get', 'secure', 'autofill_service']);
  if (autofillSetting.includes(autofillServiceName)) {
    pass('Aegis is the active Android Autofill service');
  } else {
    warn(`Aegis is not the active Android Autofill service: ${autofillSetting || 'empty'}`);
  }
}

if (failed) {
  process.exit(1);
}
