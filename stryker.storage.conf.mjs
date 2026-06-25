/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/desktopStorage.ts',
    'src/lib/secureStorage.ts',
  ],
  testFiles: [
    'src/lib/desktopStorage.test.ts',
    'src/lib/secureStorage.test.ts',
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
  incrementalFile: 'reports/mutation/storage-bridges-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/storage-bridges.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/storage-bridges.json',
  },
};
