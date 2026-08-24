import base from './stryker.base.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
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
  thresholds: {
    high: 80,
    low: 60,
    break: 45,
  },
  incrementalFile: 'reports/mutation/search-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/search.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/search.json',
  },
};