/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/share.ts',
    'src/lib/recoveryKey.ts',
    'src/lib/backupValidation.ts',
    'src/lib/vaultDatabaseFormat.ts',
  ],
  testFiles: [
    'src/lib/share.test.ts',
    'src/lib/share.fuzz.test.ts',
    'src/lib/recoveryKey.test.ts',
    'src/lib/recoveryKey.fuzz.test.ts',
    'src/lib/backupValidation.test.ts',
    'src/lib/backupValidation.fuzz.test.ts',
    'src/lib/vaultDatabaseFormat.test.ts',
  ],
  vitest: {
    configFile: 'vitest.config.ts',
    related: false,
  },
  reporters: ['progress', 'clear-text', 'html', 'json'],
  thresholds: {
    high: 85,
    low: 75,
    break: 70,
  },
  timeoutMS: 15000,
  dryRunTimeoutMinutes: 3,
  concurrency: 2,
  cleanTempDir: 'always',
  ignoreStatic: true,
  tempDirName: '.stryker-tmp',
  incremental: true,
  incrementalFile: 'reports/mutation/security-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/security.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/security.json',
  },
};
