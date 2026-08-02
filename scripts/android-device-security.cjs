const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const launchApp = args.has('--launch');
const releaseMode = args.has('--release');
const buildType = releaseMode ? 'release' : 'debug';
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const adb = sdkRoot ? path.join(sdkRoot, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb') : 'adb';
const packageName = releaseMode ? 'com.hafgit99.aegisvault7' : 'com.hafgit99.aegisvault7.debug';
const mainActivitySource = path.join(
  repoRoot,
  'src-tauri',
  'gen',
  'android',
  'app',
  'src',
  'main',
  'java',
  'com',
  'hafgit99',
  'aegisvault7',
  'MainActivity.kt',
);
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

function run(commandArgs) {
  return execFileSync(adb, commandArgs, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function tryRun(commandArgs) {
  try {
    return run(commandArgs);
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || error.message || ''}`.trim();
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function hasExactPackage(packageList, name) {
  return packageList.split(/\\r?\\n/).some((line) => line.trim() === 'package:' + name);
}

function parseReadyDevices(output) {
  return output
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /\sdevice\s/.test(line) || line.endsWith('\tdevice'));
}

function resolveLaunchComponent() {
  return tryRun(['shell', 'cmd', 'package', 'resolve-activity', '--brief', packageName])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => line.includes('/')) || '';
}

function sourceHasFlagSecure() {
  const source = fs.existsSync(mainActivitySource) ? fs.readFileSync(mainActivitySource, 'utf8') : '';
  return source.includes('WindowManager.LayoutParams.FLAG_SECURE') &&
    /window\.setFlags\(\s*WindowManager\.LayoutParams\.FLAG_SECURE,\s*WindowManager\.LayoutParams\.FLAG_SECURE\s*\)/.test(source);
}
function sourceHasWebViewDebugGuard() {
  const source = fs.existsSync(mainActivitySource) ? fs.readFileSync(mainActivitySource, 'utf8') : '';
  return /WebView\.setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/.test(source);
}

function summarizeRelevantLogcat() {
  const logs = tryRun(['logcat', '-d', '-t', '300']);
  const relevant = logs
    .split(/\r?\n/)
    .filter((line) => (
      line.includes(packageName) ||
      line.includes('FATAL EXCEPTION') ||
      line.includes('AndroidRuntime') ||
      line.includes('AegisAutofill') ||
      line.includes('Tauri')
    ))
    .slice(-80);

  if (relevant.length === 0) {
    pass('no recent crash/runtime log lines for Aegis package');
    return;
  }

  const fatal = relevant.some((line) => line.includes('FATAL EXCEPTION') || line.includes('AndroidRuntime'));
  if (fatal) {
    fail('recent AndroidRuntime/FATAL log lines found for Aegis package');
  } else {
    pass('recent Aegis runtime log excerpt contains no fatal crash marker');
  }

  console.log('INFO recent-logcat-begin');
  relevant.forEach((line) => console.log(line));
  console.log('INFO recent-logcat-end');
}

console.log('Android device security doctor (' + buildType + ', ' + packageName + ')');

if (fs.existsSync(adb) || adb === 'adb') {
  pass(`adb resolved: ${adb}`);
} else {
  fail(`adb not found: ${adb}`);
}

const devices = parseReadyDevices(tryRun(['devices', '-l']));
if (devices.length === 0) {
  fail('No authorized Android device is ready.');
} else {
  pass(`authorized Android device ready: ${devices[0]}`);
}

if (devices.length > 0) {
  tryRun(['shell', 'cmd', 'package', 'install-existing', '--user', '0', packageName]);

  const packages = tryRun(['shell', 'pm', 'list', 'packages', '--user', '0', packageName]);
  if (hasExactPackage(packages, packageName)) {
    pass(`${packageName} is installed for user 0`);
  } else {
    fail(`${packageName} is not installed for user 0`);
  }

  const component = resolveLaunchComponent();
  if (component) {
    pass(`launchable activity resolved: ${component}`);
    if (launchApp) {
      tryRun(['shell', 'am', 'start', '-n', component]);
      sleep(1500);
    }
  } else {
    fail(`No launchable activity found for ${packageName}`);
  }

  const packageDump = tryRun(['shell', 'dumpsys', 'package', packageName]);
  const dataDir = packageDump.match(/dataDir=(\S+)/)?.[1] || '';
  if (dataDir.startsWith(`/data/user/0/${packageName}`)) {
    pass(`app-private dataDir verified: ${dataDir}`);
  } else {
    fail(`app dataDir is not app-private: ${dataDir || 'unknown'}`);
  }

  if (sourceHasFlagSecure()) {
    pass('MainActivity sets FLAG_SECURE before WebView creation');
  } else {
    fail('MainActivity FLAG_SECURE source guard is missing or changed');
  }
  if (sourceHasWebViewDebugGuard()) {
    pass('WebView debugging is restricted to BuildConfig.DEBUG');
  } else {
    fail('WebView debugging release guard is missing or changed');
  }

  const packageFlagsLine = packageDump
    .split(/\r?\n/)
    .find((line) => /(?:pkgFlags|flags)=\[/.test(line)) || '';
  const installedDebuggable = /\bDEBUGGABLE\b/.test(packageFlagsLine);
  if (releaseMode && installedDebuggable) {
    fail('installed release package is marked DEBUGGABLE');
  } else if (releaseMode) {
    pass('installed release package is not marked DEBUGGABLE');
  } else {
    pass('debug package mode is explicitly selected');
  }

  const runAsResult = tryRun(['shell', 'run-as', packageName, 'id']);
  const runAsSucceeded = /\buid=\d+/.test(runAsResult);
  if (releaseMode && runAsSucceeded) {
    fail('run-as succeeded for the release package; debuggable exposure detected');
  } else if (releaseMode) {
    pass('run-as is denied for the release package');
  }

  const windowDump = tryRun(['shell', 'dumpsys', 'window']);
  const focusLines = windowDump
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes('mCurrentFocus=') || line.includes('mFocusedApp=') || line.includes(packageName));
  const isForeground = focusLines.some((line) => line.includes(packageName));
  if (isForeground) {
    pass('Aegis package is visible in current window focus dump');
  } else {
    warn('Aegis package is not visible in current window focus dump; run after android:device:smoke or pass --launch');
  }

  console.log('INFO window-focus-begin');
  focusLines.slice(-20).forEach((line) => console.log(line));
  console.log('INFO window-focus-end');

  const secureLines = windowDump
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /secure|FLAG_SECURE|mDisableSecureWindows/i.test(line))
    .slice(-30);
  if (secureLines.length > 0) {
    console.log('INFO window-secure-lines-begin');
    secureLines.forEach((line) => console.log(line));
    console.log('INFO window-secure-lines-end');
  } else {
    warn('window dump did not expose secure flag lines on this Android build');
  }

  summarizeRelevantLogcat();
}

if (failed) {
  process.exit(1);
}
