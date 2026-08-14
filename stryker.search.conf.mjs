/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  mutate: [
    'src/lib/fuzzySearch.ts',
    'src/lib/recentSearches.ts',
    'src/lib/tags.ts',
    'src/lib/smartFolders.ts',
  ],
  testFiles: [
    'src/lib/fuzzySearch.test.ts',
    'src/lib/fuzzySearch.fuzz.test.ts',
    'src/lib/recentSearches.test.ts',
    'src/lib/tags.test.ts',
    'src/lib/smartFolders.test.ts',
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
  incrementalFile: 'reports/mutation/search-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/search.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/search.json',
  },
};
