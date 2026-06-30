const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const isWindows = process.platform === 'win32';

const platform = getArgValue('--platform') || detectPlatform();
const dryRun = hasFlag('--dry-run');
const skipUnit = hasFlag('--skip-unit');
const skipWebBuild = hasFlag('--skip-web-build');
const skipExtension = hasFlag('--skip-extension');
const skipDesktopBuild = hasFlag('--skip-desktop-build');
const skipCollect = hasFlag('--skip-collect');
const skipEvidenceVerify = hasFlag('--skip-evidence-verify');
const skipReleaseNotes = hasFlag('--skip-release-notes');
const signedReleaseNotes = hasFlag('--signed-release-notes');
const releaseChannel = getArgValue('--channel');
const allowDirtyEvidence = hasFlag('--allow-dirty-evidence');
const allowEmptyEvidence = hasFlag('--allow-empty-evidence');
const macUniversal = hasFlag('--mac-universal');

function hasFlag(flag) {
  return args.includes(flag);
}

function getArgValue(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function detectPlatform() {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'macos';
  return 'linux';
}

function usage() {
  return [
    'Desktop release gate',
    '',
    'Usage:',
    '  npm run desktop:release:gate -- [options]',
    '',
    'Options:',
    '  --platform <windows|linux|macos>  Collect evidence for a specific platform.',
    '  --mac-universal                  Build macOS universal artifacts on macOS.',
    '  --dry-run                        Print the gate plan without executing commands.',
    '  --skip-unit                      Skip unit tests.',
    '  --skip-web-build                 Skip Vite web build.',
    '  --skip-extension                 Skip browser extension build.',
    '  --skip-desktop-build             Skip Tauri desktop build and only collect existing artifacts.',
    '  --skip-collect                   Skip release-local evidence collection.',
    '  --skip-evidence-verify           Skip release-local evidence verification.',
    '  --skip-release-notes              Skip RELEASE_NOTES.md generation.',
    '  --channel <name>                  Release notes channel label.',
    '  --signed-release-notes            Mark generated release notes as signed.',
    '  --allow-dirty-evidence           Permit dirty metadata during evidence verification.',
    '  --allow-empty-evidence           Permit empty artifact metadata during diagnostics.',
    '  --help                           Show this help.',
  ].join('\n');
}

function assertPlatform(value) {
  if (!['windows', 'linux', 'macos'].includes(value)) {
    throw new Error('Unsupported desktop release platform: ' + value);
  }
}

function assertHostCanBuild(targetPlatform) {
  if (skipDesktopBuild || dryRun) return;

  const hostPlatform = detectPlatform();
  if (hostPlatform !== targetPlatform) {
    throw new Error([
      'Cannot build ' + targetPlatform + ' desktop artifacts on ' + hostPlatform + '.',
      'Run on the matching OS, use the private build workflow, or pass --skip-desktop-build to collect existing artifacts only.',
    ].join(' '));
  }
}

function commandLabel(command, commandArgs) {
  return (command + ' ' + commandArgs.join(' ')).trim();
}

function run(command, commandArgs) {
  if (dryRun) {
    console.log('\n[dry-run] ' + commandLabel(command, commandArgs));
    return;
  }

  console.log('\n> ' + commandLabel(command, commandArgs));

  const result = spawnSync(command, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: isWindows,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function printPlan(steps) {
  console.log('Aegis Vault 7 desktop release gate');
  console.log('Platform: ' + platform);
  console.log('Host: ' + process.platform);
  console.log('Dry run: ' + (dryRun ? 'yes' : 'no'));
  console.log('Steps:');
  steps.forEach((step, index) => console.log((index + 1) + '. ' + commandLabel(step.command, step.args)));
}

if (hasFlag('--help')) {
  console.log(usage());
  process.exit(0);
}

assertPlatform(platform);
assertHostCanBuild(platform);

const steps = [
  { command: 'npm', args: ['run', 'lint'] },
];

if (!skipUnit) {
  steps.push({ command: 'npm', args: ['run', 'test:unit'] });
}

if (!skipWebBuild) {
  steps.push({ command: 'npm', args: ['run', 'build'] });
}

if (!skipExtension) {
  steps.push({ command: 'npm', args: ['run', 'build:extension'] });
}

if (!skipDesktopBuild) {
  const tauriArgs = ['tauri', 'build'];
  if (platform === 'macos' && macUniversal) {
    tauriArgs.push('--target', 'universal-apple-darwin');
  }
  steps.push({ command: 'npx', args: tauriArgs });
}

if (!skipCollect) {
  steps.push({ command: 'node', args: ['scripts/collect-release-artifacts.cjs', '--platform', platform] });
}

if (!skipCollect && !skipReleaseNotes) {
  const notesArgs = ['scripts/desktop-release-notes.cjs', '--platform', platform];
  if (releaseChannel) notesArgs.push('--channel', releaseChannel);
  if (signedReleaseNotes) notesArgs.push('--signed');
  steps.push({ command: 'node', args: notesArgs });
}

if (!skipCollect && !skipEvidenceVerify) {
  const evidenceArgs = ['scripts/desktop-release-evidence.cjs', '--platform', platform];
  if (allowDirtyEvidence) evidenceArgs.push('--allow-dirty');
  if (allowEmptyEvidence) evidenceArgs.push('--allow-empty');
  steps.push({ command: 'node', args: evidenceArgs });
}

printPlan(steps);
for (const step of steps) {
  run(step.command, step.args);
}

console.log('\nDesktop release gate completed. Review release-local/' + platform + ' before publishing.');
