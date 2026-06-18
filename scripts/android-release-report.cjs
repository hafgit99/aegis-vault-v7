const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const androidRoot = path.join(repoRoot, 'src-tauri', 'gen', 'android');
const outputsRoot = path.join(androidRoot, 'app', 'build', 'outputs');
const sourceManifestPath = path.join(androidRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
const appGradlePath = path.join(androidRoot, 'app', 'build.gradle.kts');
const tauriPropertiesPath = path.join(androidRoot, 'app', 'tauri.properties');
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
const sizeWarnMiB = 250;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function findArtifacts() {
  return walk(outputsRoot)
    .filter((file) => ['.apk', '.aab'].includes(path.extname(file).toLowerCase()))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
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

function runTool(tool, args) {
  const quote = (value) => `"${String(value).replaceAll('"', '\\"')}"`;
  const command = [quote(tool), ...args.map(quote)].join(' ');

  try {
    return execSync(command, {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    return `${error.stdout || ''}${error.stderr || error.message || ''}`;
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

  return {
    packageName,
    versionName,
    versionCode,
    sdkVersion,
    targetSdkVersion,
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

function status(value) {
  return value ? 'PASS' : 'WARN';
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
  console.log(`  inspection: ${manifest.source}`);

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

  console.log(`  ${status(permissionsExpected)} permissions-expected`);
  console.log(`  ${status(manifest.allowBackupDisabled)} allowBackup-disabled`);
  console.log(`  ${status(manifest.fullBackupDisabled)} fullBackup-disabled`);
  console.log(isDebugBuild
    ? '  INFO cleartext-debug-allowed'
    : `  ${status(manifest.cleartextDisabled)} cleartext-disabled`);
  console.log(`  ${status(manifest.autofillServiceProtected)} autofill-service-protected`);
  console.log(`  ${status(manifest.fileProviderPrivate)} fileprovider-private`);
}

const artifacts = findArtifacts();
if (artifacts.length === 0) {
  console.log(`No Android APK/AAB artifacts found under ${path.relative(repoRoot, outputsRoot)}.`);
  process.exit(0);
}

console.log('Android release artifact report');
console.log(`SDK: ${sdkRoot || 'not configured'}`);
artifacts.forEach(reportArtifact);
