/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/csvParser.ts',
    'src/lib/fileDecoder.ts',
  ],
  testFiles: [
    'src/lib/importer.test.ts',
    'src/lib/csvParser.test.ts',
    'src/lib/fileDecoder.test.ts',
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
  incrementalFile: 'reports/mutation/importer-helpers-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/importer-helpers.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/importer-helpers.json',
  },
};
