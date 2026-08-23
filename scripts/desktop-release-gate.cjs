const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { hasFlag, getArgValue, detectPlatform, assertPlatform } = require('./release-utils.cjs');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const isWindows = process.platform === 'win32';

if (
  isWindows &&
  !process.env.CARGO_TARGET_DIR &&
  rootDir.toLowerCase().includes(`${path.sep}onedrive${path.sep}`)
) {
  process.env.CARGO_TARGET_DIR = path.join(os.tmpdir(), 'aegis-vault-v7-tauri-target');
  console.log('Using a local Cargo target directory to avoid OneDrive build locks: ' + process.env.CARGO_TARGET_DIR);
}

const platform = getArgValue(args, '--platform') || detectPlatform();
const dryRun = hasFlag(args, '--dry-run');
const skipVersionCheck = hasFlag(args, '--skip-version-check');
const skipUnit = hasFlag(args, '--skip-unit');
const skipWebBuild = hasFlag(args, '--skip-web-build');
const skipExtension = hasFlag(args, '--skip-extension');
const skipDesktopBuild = hasFlag(args, '--skip-desktop-build');
const skipCollect = hasFlag(args, '--skip-collect');
const skipEvidenceVerify = hasFlag(args, '--skip-evidence-verify');
const skipReleaseNotes = hasFlag(args, '--skip-release-notes');
const skipSigningReport = hasFlag(args, '--skip-signing-report');
const finalMode = hasFlag(args, '--final');
const requireSignedArtifacts = hasFlag(args, '--require-signed-artifacts') || (finalMode && platform !== 'linux');
const signedReleaseNotes = hasFlag(args, '--signed-release-notes') || (finalMode && platform !== 'linux');
const releaseChannel = getArgValue(args, '--channel');
const allowDirtyEvidence = hasFlag(args, '--allow-dirty-evidence');
const allowEmptyEvidence = hasFlag(args, '--allow-empty-evidence');
const requireCompletedChecklist = hasFlag(args, '--require-completed-checklist') || finalMode;
const macUniversal = hasFlag(args, '--mac-universal');

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
    '  --final                          Require a complete publishable candidate; Windows/macOS signatures and all manual checks become mandatory.',
    '  --skip-version-check             Skip desktop version consistency check.',
    '  --skip-unit                      Skip unit tests.',
    '  --skip-web-build                 Skip Vite web build.',
    '  --skip-extension                 Skip browser extension build.',
    '  --skip-desktop-build             Skip Tauri desktop build and only collect existing artifacts.',
    '  --skip-collect                   Skip release-local evidence collection.',
    '  --skip-evidence-verify           Skip release-local evidence verification.',
    '  --skip-release-notes              Skip RELEASE_NOTES.md generation.',
    '  --skip-signing-report             Skip DESKTOP_SIGNATURES.md generation.',
    '  --require-signed-artifacts        Fail if signable artifacts are not verified as signed.',
    '  --channel <name>                  Release notes channel label.',
    '  --signed-release-notes            Mark generated release notes as signed.',
    '  --allow-dirty-evidence           Permit dirty metadata during evidence verification.',
    '  --allow-empty-evidence           Permit empty artifact metadata during diagnostics.',
    '  --require-completed-checklist     Require completed manual smoke checklist during evidence verification.',
    '  --help                           Show this help.',
  ].join('\n');
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

function assertFinalMode() {
  if (!finalMode) return;
  const forbiddenSkips = [
    [skipVersionCheck, '--skip-version-check'],
    [skipUnit, '--skip-unit'],
    [skipWebBuild, '--skip-web-build'],
    [skipDesktopBuild, '--skip-desktop-build'],
    [skipCollect, '--skip-collect'],
    [skipEvidenceVerify, '--skip-evidence-verify'],
    [skipReleaseNotes, '--skip-release-notes'],
    [skipSigningReport, '--skip-signing-report'],
    [allowDirtyEvidence, '--allow-dirty-evidence'],
    [allowEmptyEvidence, '--allow-empty-evidence'],
  ].filter(([enabled]) => enabled).map(([, flag]) => flag);
  if (forbiddenSkips.length > 0) {
    throw new Error('Final desktop release mode does not allow: ' + forbiddenSkips.join(', '));
  }
}
function commandLabel(command, commandArgs) {
  return (command + ' ' + commandArgs.join(' ')).trim();
}

function killRunningProcessesOnWindows() {
  if (process.platform === 'win32' && !dryRun) {
    try {
      const { spawnSync } = require('child_process');
      spawnSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', "Get-Process -Name 'aegis-vault-v7' -ErrorAction SilentlyContinue | Stop-Process -Force"],
        { stdio: 'ignore' },
      );
    } catch (_) {}
  }
}


const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');

function run(command, commandArgs) {
  if (command === 'npx' && commandArgs.includes('build')) {
    killRunningProcessesOnWindows();
  }

  if (dryRun) {
    console.log('\n[dry-run] ' + commandLabel(command, commandArgs));
    return;
  }

  let executable = command;
  let args = commandArgs;

  if (command === 'npm') {
    if (fs.existsSync(npmCli)) {
      executable = process.execPath;
      args = [npmCli, ...commandArgs];
    } else {
      executable = isWindows ? 'npm.cmd' : 'npm';
    }
  } else if (command === 'npx') {
    if (fs.existsSync(npxCli)) {
      executable = process.execPath;
      args = [npxCli, ...commandArgs];
    } else {
      executable = isWindows ? 'npx.cmd' : 'npx';
    }
  } else if (command === 'node') {
    executable = process.execPath;
    args = commandArgs;
  } else if (command === 'cargo' && isWindows) {
    executable = 'cargo.exe';
  } else if (command === 'rustup' && isWindows) {
    executable = 'rustup.exe';
  }

  console.log('\n> ' + commandLabel(command, commandArgs));

  const result = spawnSync(executable, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: !fs.existsSync(npmCli) && isWindows && (command === 'npm' || command === 'npx'),
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

if (hasFlag(args, '--help')) {
  console.log(usage());
  process.exit(0);
}

assertPlatform(platform);
assertFinalMode();
assertHostCanBuild(platform);

const steps = [
  { command: 'npm', args: ['run', 'lint'] },
  { command: 'npm', args: ['run', 'i18n:audit'] },
  { command: 'npm', args: ['run', 'rust:fmt:check'] },
  { command: 'npm', args: ['run', 'rust:test:native'] },
  { command: 'npm', args: ['run', 'security:no-js-master-string'] },
  { command: 'npm', args: ['run', 'security:csp'] },
  { command: 'npm', args: ['run', 'security:dependencies'] },
];

if (!skipVersionCheck) {
  steps.push({ command: 'npm', args: ['run', 'desktop:release:version:check'] });
}

if (!skipUnit) {
  steps.push({ command: 'npm', args: ['run', 'test:unit'] });
  steps.push({ command: 'npm', args: ['run', 'test:fuzz'] });
}

if (!skipWebBuild) {
  steps.push({ command: 'npm', args: ['run', 'build'] });
}

steps.push({ command: 'npm', args: ['run', 'security:release-hardening'] });

if (!skipExtension) {
  steps.push({ command: 'npm', args: ['run', 'build:extension'] });
}

if (!skipDesktopBuild) {
  const tauriArgs = ['tauri', 'build'];
  if (platform === 'macos' && macUniversal) {
    tauriArgs.push('--target', 'universal-apple-darwin');
  }
  if (!process.env.TAURI_SIGNING_PRIVATE_KEY) {
    tauriArgs.push('--config', JSON.stringify({ bundle: { createUpdaterArtifacts: false } }));
  }
  steps.push({ command: 'npx', args: tauriArgs });
}

if (!skipCollect) {
  steps.push({ command: 'node', args: ['scripts/collect-release-artifacts.cjs', '--platform', platform] });
}

if (!skipCollect && !skipSigningReport) {
  const signingArgs = ['scripts/desktop-signing-report.cjs', '--platform', platform];
  if (requireSignedArtifacts) signingArgs.push('--require-signed');
  steps.push({ command: 'node', args: signingArgs });
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
  if (requireCompletedChecklist) evidenceArgs.push('--require-completed-checklist');
  if (requireSignedArtifacts) evidenceArgs.push('--require-signed-artifacts');
  steps.push({ command: 'node', args: evidenceArgs });
}

printPlan(steps);
for (const step of steps) {
  run(step.command, step.args);
}

console.log('\nDesktop release gate completed. Review release-local/' + platform + ' before publishing.');
