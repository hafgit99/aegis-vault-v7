const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { MANIFEST_FILENAME, validateIntegrityManifest } = require('./generate-asset-integrity-manifest.cjs');

const rootDir = path.resolve(__dirname, '..');
const requireAndroidArtifact = process.argv.includes('--require-android-artifact');
const findings = [];
const notes = [];

function fail(message) {
  findings.push(message);
}

function readText(relPath) {
  return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

function walkFiles(absoluteDir, output = []) {
  if (!fs.existsSync(absoluteDir)) return output;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const absolutePath = path.join(absoluteDir, entry.name);
    if (entry.isDirectory()) walkFiles(absolutePath, output);
    else if (entry.isFile()) output.push(absolutePath);
  }
  return output;
}

function relative(absolutePath) {
  return path.relative(rootDir, absolutePath).replace(/\\/g, '/');
}

function isTextBundle(file) {
  return /\.(?:js|mjs|cjs|css|html|json|txt|xml)$/i.test(file);
}

function isFirstPartyBundle(file) {
  const name = path.basename(file).toLowerCase();
  return /\.js$/i.test(name) && !name.includes('vendor');
}

function scanProductionBundle() {
  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fail('dist/: production bundle is missing; run npm run build before this gate');
    return;
  }

  const files = walkFiles(distDir);
  for (const file of files.filter((candidate) => candidate.endsWith('.map'))) {
    fail(`${relative(file)}: source map must not ship in a release bundle`);
  }

  const secretPatterns = [
    { label: 'private-key material', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
    { label: 'Android signing password variable', regex: /AEGIS_ANDROID_(?:KEYSTORE|KEY)_PASSWORD/ },
    { label: 'AMO signing secret variable', regex: /(?:AMO_JWT_SECRET|WEB_EXT_API_SECRET)/ },
    { label: 'GitHub access token', regex: /gh(?:p|o|u|s|r)_[A-Za-z0-9]{36,}/ },
    { label: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/ },
    { label: 'local secrets path', regex: /(?:^|[\\/])\.secrets[\\/]/ },
    { label: 'absolute Windows user path', regex: /[A-Za-z]:\\Users\\[^\\\s]+\\/ },
  ];

  for (const file of files.filter(isTextBundle)) {
    const content = fs.readFileSync(file, 'utf8');
    if (/sourceMappingURL\s*=/.test(content)) fail(`${relative(file)}: sourceMappingURL marker found in release output`);
    if (/(?:@vite\/client|TAURI_DEV_HOST|localhost:3000)/.test(content)) {
      fail(`${relative(file)}: development runtime marker found in release output`);
    }
    for (const pattern of secretPatterns) {
      if (pattern.regex.test(content)) fail(`${relative(file)}: possible ${pattern.label} found`);
    }
    if (isFirstPartyBundle(file) && /\bconsole\s*\.(?:log|info|debug|warn|error)\s*\(/.test(content)) {
      fail(`${relative(file)}: first-party console call found in production JavaScript`);
    }
    if (isFirstPartyBundle(file) && /\bdebugger\s*;/.test(content)) {
      fail(`${relative(file)}: debugger statement found in production JavaScript`);
    }
  }
}

function scanExtensionBundles() {
  for (const directory of ['dist-extension', 'dist-extension-firefox']) {
    const absoluteDir = path.join(rootDir, directory);
    if (!fs.existsSync(absoluteDir)) continue;
    for (const file of walkFiles(absoluteDir)) {
      if (file.endsWith('.map')) fail(relative(file) + ': extension source map must not ship in a release bundle');
      if (/\.(?:js|css)$/i.test(file)) {
        const content = fs.readFileSync(file, 'utf8');
        if (/sourceMappingURL\s*=/.test(content)) fail(relative(file) + ': extension sourceMappingURL marker found');
      }
    }
  }
}
function scanAssetIntegrityManifest() {
  const distDir = path.join(rootDir, 'dist');
  const manifestPath = path.join(distDir, MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    fail('dist/' + MANIFEST_FILENAME + ': production asset integrity manifest is missing');
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail('dist/' + MANIFEST_FILENAME + ': manifest JSON is invalid: ' + error.message);
    return;
  }
  for (const issue of validateIntegrityManifest(manifest, distDir)) {
    fail('dist/' + MANIFEST_FILENAME + ': ' + issue);
  }
  if ((manifest.assets || []).some((asset) => asset.path === MANIFEST_FILENAME)) {
    fail('dist/' + MANIFEST_FILENAME + ': manifest must not hash itself');
  }
  notes.push('Verified ' + (manifest.assets || []).length + ' packaged assets against the integrity manifest');
}
function scanTrackedSensitiveFiles() {
  let tracked = [];
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    tracked = output.split('\0').filter(Boolean).map((file) => file.replace(/\\/g, '/'));
  } catch (error) {
    fail(`git ls-files failed: ${error.message}`);
    return;
  }

  const forbidden = tracked.filter((file) => {
    if (file === '.env.example') return false;
    return file.startsWith('.secrets/')
      || /(?:^|\/)\.env(?:\.|$)/.test(file)
      || /\.(?:p12|pfx|jks|keystore|pem|key)$/i.test(file)
      || /(?:^|\/)(?:key|keystore)\.properties$/i.test(file);
  });
  for (const file of forbidden) fail(`${file}: sensitive credential/signing file is tracked by git`);
}

function scanSourceConfiguration() {
  const packageJson = JSON.parse(readText('package.json'));
  if (!String(packageJson.scripts?.build || '').includes('generate-asset-integrity-manifest.cjs')) {
    fail('package.json: asset integrity manifest generation is not part of npm run build');
  }
  const rustBuild = readText('src-tauri/build.rs');
  if (!rustBuild.includes('AEGIS_ASSET_INTEGRITY_ROOT') || !rustBuild.includes('aegis-integrity.json')) {
    fail('src-tauri/build.rs: asset integrity root is not embedded in the native release binary');
  }
  const rustLib = readText('src-tauri/src/lib.rs');
  if (!rustLib.includes('get_asset_integrity_anchor') || !rustLib.includes('AEGIS_ASSET_INTEGRITY_ROOT')) {
    fail('src-tauri/src/lib.rs: native asset integrity anchor command is missing');
  }
  const extensionBuildPath = 'scripts/build-extension.js';
  const extensionBuild = readText(extensionBuildPath);
  if (!/const isDebugBuild = process\.argv\.includes\(['"]--debug['"]\)/.test(extensionBuild)
    || !/minify:\s*!isDebugBuild/.test(extensionBuild)
    || !/sourcemap:\s*isDebugBuild/.test(extensionBuild)) {
    fail(extensionBuildPath + ': release extension builds must be minified and source-map free');
  }
  const viteConfig = readText('vite.config.ts');
  if (!/sourcemap:\s*isDebugBuild/.test(viteConfig)) {
    fail('vite.config.ts: source maps must be controlled by the explicit debug-build flag');
  }
  if (!/drop:\s*\[\s*['"]console['"]\s*,\s*['"]debugger['"]\s*\]/s.test(viteConfig)) {
    fail('vite.config.ts: production esbuild must drop console and debugger statements');
  }

  const cargoManifestPath = 'src-tauri/Cargo.toml';
  const cargoManifest = readText(cargoManifestPath);
  const releaseProfile = cargoManifest.match(/\[profile\.release\]([\s\S]*?)(?=\n\[|$)/)?.[1] || '';
  const requiredReleaseSettings = [
    { label: 'opt-level=3', regex: /\bopt-level\s*=\s*3\b/ },
    { label: 'thin LTO', regex: /\blto\s*=\s*"thin"/ },
    { label: 'single codegen unit', regex: /\bcodegen-units\s*=\s*1\b/ },
    { label: 'panic=abort', regex: /\bpanic\s*=\s*"abort"/ },
    { label: 'symbol stripping', regex: /\bstrip\s*=\s*"symbols"/ },
    { label: 'debug info disabled', regex: /\bdebug\s*=\s*0\b/ },
    { label: 'incremental disabled', regex: /\bincremental\s*=\s*false\b/ },
  ];
  for (const setting of requiredReleaseSettings) {
    if (!setting.regex.test(releaseProfile)) fail(`${cargoManifestPath}: release profile is missing ${setting.label}`);
  }
  const tauriConfig = JSON.parse(readText('src-tauri/tauri.conf.json'));
  for (const [index, windowConfig] of (tauriConfig.app?.windows || []).entries()) {
    if (windowConfig.devtools === true) fail(`src-tauri/tauri.conf.json: app.windows[${index}].devtools must not be true`);
  }

  const gradlePath = 'src-tauri/gen/android/app/build.gradle.kts';
  const gradle = readText(gradlePath);
  const releaseStart = gradle.indexOf('getByName("release")');
  const releaseEnd = gradle.indexOf('\n    kotlinOptions', releaseStart);
  const releaseBlock = releaseStart >= 0 ? gradle.slice(releaseStart, releaseEnd >= 0 ? releaseEnd : undefined) : '';
  if (!releaseBlock) fail(`${gradlePath}: release build type is missing`);
  if (!/isMinifyEnabled\s*=\s*true/.test(releaseBlock)) fail(`${gradlePath}: release R8/minification must be enabled`);
  if (!/isShrinkResources\s*=\s*true/.test(releaseBlock)) fail(`${gradlePath}: release resource shrinking must be enabled`);
  if (!/isDebuggable\s*=\s*false/.test(releaseBlock)) fail(`${gradlePath}: release build must explicitly set isDebuggable=false`);
  if (!/isJniDebuggable\s*=\s*false/.test(releaseBlock)) fail(`${gradlePath}: release JNI build must explicitly set isJniDebuggable=false`);
  if (!/debugSymbolLevel\s*=\s*["']NONE["']/.test(releaseBlock)) fail(`${gradlePath}: release native debug symbol level must be NONE`);

  const manifestPath = 'src-tauri/gen/android/app/src/main/AndroidManifest.xml';
  const manifest = readText(manifestPath);
  if (!/android:allowBackup="false"/.test(manifest)) fail(`${manifestPath}: android:allowBackup must be false`);
  if (!/android:fullBackupContent="false"/.test(manifest)) fail(`${manifestPath}: android:fullBackupContent must be false`);
  if (!/android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/.test(manifest)) {
    fail(`${manifestPath}: cleartext traffic must be controlled by the release-safe manifest placeholder`);
  }
  const mainActivityPath = 'src-tauri/gen/android/app/src/main/java/com/hafgit99/aegisvault7/MainActivity.kt';
  const mainActivity = readText(mainActivityPath);
  if (!/WebView\.setWebContentsDebuggingEnabled\(BuildConfig\.DEBUG\)/.test(mainActivity)) {
    fail(`${mainActivityPath}: WebView debugging must be tied to BuildConfig.DEBUG`);
  }
  if (!/addJavascriptInterface\((?:AndroidRuntimeSecurityBridge\(.*?\)|securityBridge),\s*"AegisAndroidSecurity"\)/.test(mainActivity)) {
    fail(`${mainActivityPath}: warning-only Android runtime security bridge is missing`);
  }

  const proguardPath = 'src-tauri/gen/android/app/proguard-rules.pro';
  const proguard = readText(proguardPath);
  if (!/(?:MainActivity\$|\.\*|bridges\.)Android\*Bridge/.test(proguard) || !/@android\.webkit\.JavascriptInterface/.test(proguard)) {
    fail(`${proguardPath}: JavaScript bridge method names are not protected from R8 renaming`);
  }
}

function scanAndroidReleaseManifests() {
  const intermediates = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'build', 'intermediates');
  const manifests = walkFiles(intermediates).filter((file) => {
    const normalized = file.replace(/\\/g, '/');
    return /\/universalRelease\/.*\/AndroidManifest\.xml$/.test(normalized)
      && /\/(?:merged_manifest|merged_manifests|packaged_manifests)\//.test(normalized);
  });

  if (manifests.length === 0) {
    const message = 'Android merged release manifest is unavailable; build a release APK for artifact-level verification';
    if (requireAndroidArtifact) fail(message);
    else notes.push(message);
    return;
  }

  for (const file of manifests) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = relative(file);
    if (/android:debuggable="true"/.test(content)) fail(`${relPath}: release application is debuggable`);
    if (!/android:allowBackup="false"/.test(content)) fail(`${relPath}: release backup protection is missing`);
    if (!/android:fullBackupContent="false"/.test(content)) fail(`${relPath}: release full-backup protection is missing`);
    if (!/android:usesCleartextTraffic="false"/.test(content)) fail(`${relPath}: release cleartext traffic is not disabled`);
  }
  notes.push(`Verified ${manifests.length} merged/packaged Android release manifest(s)`);
}

function resolveLlvmReadelf() {
  const executable = process.platform === 'win32' ? 'llvm-readelf.exe' : 'llvm-readelf';
  const sdkFallback = process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Android', 'sdk')
      : path.join(os.homedir(), 'Android', 'Sdk');
  const ndkRoots = [process.env.NDK_HOME, process.env.ANDROID_NDK_HOME].filter(Boolean);
  for (const sdkRoot of [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, sdkFallback].filter(Boolean)) {
    const parent = path.join(sdkRoot, 'ndk');
    if (!fs.existsSync(parent)) continue;
    for (const entry of fs.readdirSync(parent, { withFileTypes: true }).filter((candidate) => candidate.isDirectory())) {
      ndkRoots.push(path.join(parent, entry.name));
    }
  }

  for (const ndkRoot of [...new Set(ndkRoots)].sort().reverse()) {
    const prebuilt = path.join(ndkRoot, 'toolchains', 'llvm', 'prebuilt');
    if (!fs.existsSync(prebuilt)) continue;
    for (const host of fs.readdirSync(prebuilt, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      const candidate = path.join(prebuilt, host.name, 'bin', executable);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function scanAndroidNativeLibraries() {
  const strippedRoot = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'build', 'intermediates', 'stripped_native_libs', 'universalRelease');
  const libraries = walkFiles(strippedRoot).filter((file) => file.endsWith('.so'));
  if (libraries.length === 0) {
    const message = 'Android stripped release native libraries are unavailable; build a release APK for symbol verification';
    if (requireAndroidArtifact) fail(message);
    else notes.push(message);
    return;
  }

  const readelf = resolveLlvmReadelf();
  if (!readelf) {
    const message = 'Android NDK llvm-readelf is unavailable; native ELF sections could not be verified';
    if (requireAndroidArtifact) fail(message);
    else notes.push(message);
    return;
  }

  const forbiddenSections = ['.debug_info', '.debug_line', '.debug_abbrev', '.gnu_debuglink', '.symtab'];
  for (const library of libraries) {
    let sectionTable = '';
    try {
      sectionTable = execFileSync(readelf, ['--sections', '--wide', library], {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      fail(`${relative(library)}: llvm-readelf failed: ${error.message}`);
      continue;
    }
    for (const section of forbiddenSections) {
      if (new RegExp(`\\s${section.replace('.', '\\.')}\\s`).test(sectionTable)) {
        fail(`${relative(library)}: native release library still contains ${section}`);
      }
    }
  }
  notes.push(`Verified ${libraries.length} stripped Android release native librar${libraries.length === 1 ? 'y' : 'ies'} with llvm-readelf`);
}
scanSourceConfiguration();
scanTrackedSensitiveFiles();
scanProductionBundle();
scanAssetIntegrityManifest();
scanExtensionBundles();
scanAndroidReleaseManifests();
scanAndroidNativeLibraries();

if (findings.length > 0) {
  console.error('Status: BLOCKED');
  console.error('Release hardening gate failed:');
  for (const finding of findings) console.error(` - ${finding}`);
  for (const note of notes) console.error(` INFO ${note}`);
  process.exit(1);
}

console.log('Status: PASS');
console.log('Release hardening gate passed.');
console.log(' - Production source maps and debug markers: absent');
console.log(' - Packaged asset integrity manifest and native root anchor: verified');
console.log(' - First-party production console/debugger statements: absent');
console.log(' - Bundled secret/signing material patterns: absent');
console.log(' - Tracked credential/signing files: absent');
console.log(' - Tauri devtools, Android WebView/R8, and native symbols: hardened');
for (const note of notes) console.log(` INFO ${note}`);