/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/diceware.ts',
    'src/lib/emergencyKit.ts',
    'src/lib/random.ts',
    'src/lib/secretKey.ts',
  ],
  testFiles: [
    'src/lib/diceware.test.ts',
    'src/lib/emergencyKit.test.ts',
    'src/lib/random.test.ts',
    'src/lib/secretKey.test.ts',
  ],
  vitest: {
    configFile: 'vitest.config.ts',
    related: false,
  },
  reporters: ['progress', 'clear-text', 'html', 'json'],
  thresholds: {
    high: 80,
    low: 70,
    break: 65,
  },
  timeoutMS: 15000,
  dryRunTimeoutMinutes: 3,
  concurrency: 2,
  cleanTempDir: 'always',
  incremental: true,
  incrementalFile: 'reports/mutation/incremental.json',
};
