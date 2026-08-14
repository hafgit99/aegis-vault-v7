/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/importer.ts',
  ],
  testFiles: [
    'src/lib/importer.test.ts',
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
  ignoreStatic: true,
  tempDirName: '.stryker-tmp',
  incremental: true,
  incrementalFile: 'reports/mutation/importer-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/importer.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/importer.json',
  },
};
