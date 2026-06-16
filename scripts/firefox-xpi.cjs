const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const firefoxDistDir = path.join(rootDir, 'dist-extension-firefox');
const stagingDir = path.join(rootDir, '.tmp', 'firefox-xpi');
const artifactsDir = path.join(rootDir, 'release-local', 'firefox');
const packageJson = require(path.join(rootDir, 'package.json'));

const args = new Set(process.argv.slice(2));
const shouldSign = args.has('--sign');
const skipBuild = args.has('--skip-build');
const channel = process.env.AMO_CHANNEL || 'unlisted';
const xpiName = `aegis-vault-7-firefox-v${packageJson.version}.xpi`;

const excludedNames = new Set([
  'aegis-host.bat',
  'com.hafgit99.aegisvault7.json',
]);

function run(command, commandArgs, options = {}) {
  console.log(`\n> ${command} ${commandArgs.join(' ')}`);
  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function copyCleanExtension(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludedNames.has(entry.name)) continue;

    const sourcePath = path.join(src, entry.name);
    const destinationPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyCleanExtension(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

function assertFirefoxManifest() {
  const manifestPath = path.join(stagingDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const geckoId = manifest.browser_specific_settings?.gecko?.id;

  if (geckoId !== 'aegisvault7@hafgit99.com') {
    throw new Error('Firefox manifest must include browser_specific_settings.gecko.id = aegisvault7@hafgit99.com');
  }

  if (manifest.background?.service_worker) {
    throw new Error('Firefox build must use background.scripts, not background.service_worker');
  }
}

if (!skipBuild) {
  run('npm', ['run', 'build:extension']);
}

if (!fs.existsSync(firefoxDistDir)) {
  throw new Error('dist-extension-firefox does not exist. Run npm run build:extension first.');
}

fs.mkdirSync(artifactsDir, { recursive: true });
copyCleanExtension(firefoxDistDir, stagingDir);
assertFirefoxManifest();

run('npx', ['web-ext', 'lint', '--source-dir', stagingDir]);

if (shouldSign) {
  const apiKey = process.env.WEB_EXT_API_KEY || process.env.AMO_API_KEY;
  const apiSecret = process.env.WEB_EXT_API_SECRET || process.env.AMO_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('Missing AMO credentials.');
    console.error('Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET, or AMO_API_KEY and AMO_API_SECRET.');
    process.exit(1);
  }

  run('npx', [
    'web-ext',
    'sign',
    '--source-dir',
    stagingDir,
    '--artifacts-dir',
    artifactsDir,
    '--api-key',
    apiKey,
    '--api-secret',
    apiSecret,
    '--channel',
    channel,
    '--no-input',
  ]);
} else {
  run('npx', [
    'web-ext',
    'build',
    '--source-dir',
    stagingDir,
    '--artifacts-dir',
    artifactsDir,
    '--filename',
    xpiName,
    '--overwrite-dest',
  ]);
}

console.log(`\nFirefox artifact output: ${artifactsDir}`);
