const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { findLatestAndroidCandidateArtifacts } = require('./android-artifact-utils.cjs');

const repoRoot = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const signedOnly = args.has('--signed');
const androidRoot = path.join(repoRoot, 'src-tauri', 'gen', 'android');
const sourceManifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
const appGradlePath = path.join(androidRoot, 'app', 'build.gradle.kts');
const tauriPropertiesPath = path.join(androidRoot, 'app', 'tauri.properties');
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const sizeWarnMiB = 250;
const buildType = signedOnly ? 'release' : 'debug';
let warningCount = 0;

function findArtifacts() {
  return findLatestAndroidCandidateArtifacts(repoRoot, { buildType });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function latestBuildTool(toolName) {
  if (!sdkRoot) return null;
  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  if (!fs.existsSync(buildToolsDir)) return null;

  const executable = process.platform === 'win32' ? `${toolName}.exe` : toolName;
  return fs.readdirSync(buildToolsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(buildToolsDir, entry.name, executable))
    .filter((candidate) => fs.existsSync(candidate))
    .sort()
    .reverse()[0] || null;
}

function latestBuildToolJar(jarName) {
  if (!sdkRoot) return null;
  const buildToolsDir = path.join(sdkRoot, 'build-tools');
  if (!fs.existsSync(buildToolsDir)) return null;

  return fs.readdirSync(buildToolsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(buildToolsDir, entry.name, 'lib', jarName))
    .filter((candidate) => fs.existsSync(candidate))
    .sort()
    .reverse()[0] || null;
}

function javaExecutable() {
  const javaHome = process.env.JAVA_HOME || '';
  const candidate = javaHome ? path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : '';
  return candidate && fs.existsSync(candidate) ? candidate : 'java';
}

function runTool(tool, args) {
  try {
    return execFileSync(tool, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    return String(error.stdout || '') + String(error.stderr || error.message || '');
  }
}

function readFileIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function readTauriProperties() {
  const contents = readFileIfExists(tauriPropertiesPath);
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

function inspectSourceManifest(artifactPath = '') {
  const manifest = readFileIfExists(sourceManifestPath);
  const gradle = readFileIfExists(appGradlePath);
  const tauriProperties = readTauriProperties();
  const applicationId = gradle.match(/applicationId\s*=\s*"([^"]+)"/)?.[1] || 'unknown';
  const isDebugArtifact = artifactPath.split(path.sep).includes('debug') || path.basename(artifactPath).includes('-debug');
  const packageName = applicationId === 'unknown' ? 'unknown' : `${applicationId}${isDebugArtifact ? '.debug' : ''}`;
  const sourcePermissions = Array.from(manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)).map((match) => match[1]);
  const versionName = tauriProperties['tauri.android.versionName'] || gradle.match(/versionName\s*=.*?"([^"]+)"/)?.[1] || 'unknown';
  const versionCode = tauriProperties['tauri.android.versionCode'] || gradle.match(/versionCode\s*=.*?"?(\d+)/)?.[1] || 'unknown';
  const minSdk = gradle.match(/minSdk\s*=\s*(\d+)/)?.[1] || 'unknown';
  const targetSdk = gradle.match(/targetSdk\s*=\s*(\d+)/)?.[1] || 'unknown';

  return {
    packageName,
    versionName,
    versionCode,
    sdkVersion: minSdk,
    targetSdkVersion: targetSdk,
    permissions: sourcePermissions,
    allowBackupDisabled: /android:allowBackup="false"/.test(manifest),
    fullBackupDisabled: /android:fullBackupContent="false"/.test(manifest),
    cleartextDisabled: /android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/.test(manifest) &&
      /manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"false"/.test(gradle),
    autofillServiceProtected: /android:permission="android\.permission\.BIND_AUTOFILL_SERVICE"/.test(manifest),
    fileProviderPrivate: /androidx\.core\.content\.FileProvider/.test(manifest) &&
      /android:exported="false"/.test(manifest),
    source: 'source-manifest',
  };
}

function parseAaptBadging(output) {
  const permissions = Array.from(output.matchAll(/uses-permission(?:-sdk-\d+)?: name='([^']+)'/g)).map((match) => match[1]);
  const packageName = output.match(/^package: name='([^']+)'/m)?.[1] || 'unknown';
  const versionName = output.match(/^package: .*versionName='([^']+)'/m)?.[1] || 'unknown';
  const versionCode = output.match(/^package: .*versionCode='([^']+)'/m)?.[1] || 'unknown';
  const sdkVersion = output.match(/^sdkVersion:'([^']+)'/m)?.[1] || 'unknown';
  const targetSdkVersion = output.match(/^targetSdkVersion:'([^']+)'/m)?.[1] || 'unknown';
  const nativeAbis = output.match(/^native-code:(.*)$/m)?.[1]?.match(/'([^']+)'/g)?.map((value) => value.slice(1, -1)) || [];

  return {
    packageName,
    versionName,
    versionCode,
    sdkVersion,
    targetSdkVersion,
    nativeAbis,
    permissions,
  };
}

function inspectManifest(apkPath) {
  const sourceInspection = inspectSourceManifest(apkPath);
  const aapt = latestBuildTool('aapt');
  if (!aapt || path.extname(apkPath).toLowerCase() !== '.apk') {
    return {
      ...sourceInspection,
      toolAvailable: Boolean(aapt),
      source: path.extname(apkPath).toLowerCase() === '.apk' ? sourceInspection.source : 'source-manifest/non-apk',
    };
  }

  const badging = runTool(aapt, ['dump', 'badging', apkPath]);
  const xmltree = runTool(aapt, ['dump', 'xmltree', apkPath, 'AndroidManifest.xml']);
  const parsed = parseAaptBadging(badging);
  const toolSucceeded = parsed.packageName !== 'unknown' && !badging.includes('EPERM');

  if (!toolSucceeded) {
    return {
      ...sourceInspection,
      toolAvailable: true,
      source: 'source-manifest/aapt-unavailable',
    };
  }

  return {
    ...parsed,
    toolAvailable: true,
    source: 'apk-aapt',
    allowBackupDisabled: /android:allowBackup\(.*\)=\(type .*?\)0x0\b/.test(xmltree),
    fullBackupDisabled: /android:fullBackupContent\(.*\)=\(type .*?\)0x0\b/.test(xmltree),
    cleartextDisabled: /android:usesCleartextTraffic\(.*\)=\(type .*?\)0x0\b/.test(xmltree),
    autofillServiceProtected: xmltree.includes('android.permission.BIND_AUTOFILL_SERVICE'),
    fileProviderPrivate: xmltree.includes('androidx.core.content.FileProvider') &&
      /android:exported\(.*\)=\(type .*?\)0x0\b/.test(xmltree),
  };
}

function inspectApkSignature(apkPath) {
  if (path.extname(apkPath).toLowerCase() !== '.apk') {
    return { available: false, verified: false, reason: 'non-apk' };
  }

  const apksignerJar = latestBuildToolJar('apksigner.jar');
  if (!apksignerJar) {
    return { available: false, verified: false, reason: 'apksigner.jar unavailable' };
  }

  try {
    const output = execFileSync(javaExecutable(), [
      '-jar',
      apksignerJar,
      'verify',
      '--print-certs',
      apkPath,
    ], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 10 * 1024 * 1024,
    });

    const sha256Digest = output.match(/Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]+)/)?.[1] || '';
    const distinguishedName = output.match(/Signer #1 certificate DN: (.+)/)?.[1]?.trim() || '';
    return {
      available: true,
      verified: true,
      sha256Digest,
      distinguishedName,
    };
  } catch (error) {
    const output = String(error.stdout || '') + String(error.stderr || error.message || '');
    return {
      available: true,
      verified: false,
      reason: output.replace(/\s+/g, ' ').trim().slice(0, 300) || 'verification failed',
    };
  }
}

function check(label, value) {
  const prefix = value ? 'PASS' : 'WARN';
  if (!value) warningCount += 1;
  console.log(`  ${prefix} ${label}`);
}

function info(label) {
  console.log(`  INFO ${label}`);
}

function reportArtifact(file) {
  const relativePath = path.relative(repoRoot, file);
  const stats = fs.statSync(file);
  const sizeMiB = stats.size / 1024 / 1024;
  const manifest = inspectManifest(file);
  const isApk = path.extname(file).toLowerCase() === '.apk';
  const isDebugBuild = manifest.packageName.endsWith('.debug') ||
    relativePath.split(path.sep).includes('debug') ||
    path.basename(file).includes('-debug');

  console.log(`\n${relativePath}`);
  console.log(`  size: ${sizeMiB.toFixed(2)} MiB ${sizeMiB > sizeWarnMiB ? '(large)' : ''}`);
  console.log(`  sha256: ${sha256(file)}`);
  console.log(`  package: ${manifest.packageName}`);
  console.log(`  version: ${manifest.versionName} (${manifest.versionCode})`);
  console.log(`  sdk: min ${manifest.sdkVersion}, target ${manifest.targetSdkVersion}`);
  console.log(`  permissions: ${manifest.permissions.length ? manifest.permissions.join(', ') : 'none detected'}`);
  console.log(`  native ABIs: ${manifest.nativeAbis?.length ? manifest.nativeAbis.join(', ') : 'none detected'}`);
  console.log(`  inspection: ${manifest.source}`);
  const signature = inspectApkSignature(file);
  console.log('  signature: ' + (signature.verified ? 'verified' : 'not verified'));
  if (signature.sha256Digest) console.log('  signer SHA-256: ' + signature.sha256Digest);
  if (signature.distinguishedName) console.log('  signer DN: ' + signature.distinguishedName);
  if (!signature.verified && signature.reason) console.log('  signature reason: ' + signature.reason);

  if (!isApk) {
    console.log('  manifest checks: skipped for non-APK artifact');
    return;
  }

  const expectedPermissions = new Set([
    'android.permission.INTERNET',
    'android.permission.USE_BIOMETRIC',
    'android.permission.USE_FINGERPRINT',
    `${manifest.packageName}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`,
  ]);
  const sourceOnlyPermissions = manifest.source.startsWith('source-manifest');
  const permissionsExpected = manifest.permissions.length > 0 &&
    manifest.permissions.every((permission) => expectedPermissions.has(permission)) &&
    (!sourceOnlyPermissions || manifest.permissions.includes('android.permission.INTERNET'));

  check('permissions-expected', permissionsExpected);
  check('allowBackup-disabled', manifest.allowBackupDisabled);
  check('fullBackup-disabled', manifest.fullBackupDisabled);
  if (isDebugBuild) {
    info('cleartext-debug-allowed');
  } else {
    check('cleartext-disabled', manifest.cleartextDisabled);
  }
  check('apk-signature-verified', signature.verified);
  const nativeAbiCount = manifest.nativeAbis?.length || 0;
  check('native-abi-single-target', nativeAbiCount <= 1);
  if (nativeAbiCount === 1) {
    check('native-abi-arm64-v8a', manifest.nativeAbis[0] === 'arm64-v8a');
  }
  check('autofill-service-protected', manifest.autofillServiceProtected);
  check('fileprovider-private', manifest.fileProviderPrivate);
}

const artifacts = findArtifacts();
if (artifacts.length === 0) {
  console.log(`No Android ${buildType} APK/AAB artifacts found under src-tauri/gen/android/app/build/outputs.`);
  process.exit(0);
}

console.log('Android release artifact report');
console.log(`Mode: ${buildType} candidate artifacts only`);
console.log(`SDK: ${sdkRoot || 'not configured'}`);
artifacts.forEach(reportArtifact);

if (strict && warningCount > 0) {
  console.error(`\nAndroid release artifact report failed with ${warningCount} warning(s).`);
  process.exit(1);
}
