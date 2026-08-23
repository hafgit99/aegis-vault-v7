const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = hasFlag('--dry-run');
const skipE2e = hasFlag('--skip-e2e');

const focusedUnitFiles = [
  'src/lib/waSqlitePersistence.test.ts',
  'src/lib/waSqlitePersistenceSmoke.test.ts',
  'src/lib/waSqlitePromotionReadiness.test.ts',
  'src/lib/vaultStorageMigration.test.ts',
  'src/lib/vaultStorageMigrationCandidate.test.ts',
  'src/lib/vaultStorageActiveMigration.test.ts',
  'src/lib/vaultStorageProvider.test.ts',
  'src/lib/waSqliteVaultStorageRepository.test.ts',
  'src/lib/storageSession.test.ts',
];

function hasFlag(flag) {
  return args.includes(flag);
}

function usage() {
  return [
    'wa-sqlite final gate',
    '',
    'Usage:',
    '  npm run wa-sqlite:final:gate -- [options]',
    '',
    'Options:',
    '  --skip-e2e   Run only focused unit/integration tests.',
    '  --dry-run    Print the command plan without executing.',
    '  --help       Show this help.',
  ].join('\n');
}

function commandLabel(command, commandArgs) {
  return (command + ' ' + commandArgs.join(' ')).trim();
}

function resolveExecutable(command) {
  if (process.platform === 'win32') {
    if (command === 'npm') return 'npm.cmd';
    if (command === 'npx') return 'npx.cmd';
  }
  return command;
}

function run(command, commandArgs) {
  if (dryRun) {
    console.log('[dry-run] ' + commandLabel(command, commandArgs));
    return;
  }

  const exe = resolveExecutable(command);
  console.log('\n> ' + commandLabel(exe, commandArgs));
  const result = spawnSync(exe, commandArgs, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function printPlan(steps) {
  console.log('Aegis Vault 7 wa-sqlite final gate');
  console.log('Dry run: ' + (dryRun ? 'yes' : 'no'));
  console.log('E2E: ' + (skipE2e ? 'skipped' : 'included'));
  console.log('Steps:');
  steps.forEach((step, index) => console.log((index + 1) + '. ' + commandLabel(step.command, step.args)));
}

if (hasFlag('--help')) {
  console.log(usage());
  process.exit(0);
}

const steps = [
  { command: 'npm', args: ['run', 'lint'] },
  { command: 'npm', args: ['run', 'rust:fmt:check'] },
  { command: 'npm', args: ['run', 'rust:test:native'] },
  { command: 'npm', args: ['run', 'security:no-js-master-string'] },
  { command: 'npm', args: ['run', 'security:csp'] },
  { command: 'npm', args: ['run', 'security:dependencies'] },
  { command: 'npm', args: ['run', 'test:fuzz'] },
  { command: 'npx', args: ['vitest', 'run', ...focusedUnitFiles] },
];

if (!skipE2e) {
  steps.push({ command: 'npm', args: ['run', 'test:e2e', '--', '--project=chromium', '-g', 'wa-sqlite'] });
}

printPlan(steps);
for (const step of steps) {
  run(step.command, step.args);
}

console.log('\nwa-sqlite final gate completed.');
