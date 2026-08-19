import base from './stryker.base.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  mutate: [
    'src/lib/desktopStorage.ts',
    'src/lib/secureStorage.ts',
  ],
  testFiles: [
    'src/lib/desktopStorage.test.ts',
    'src/lib/secureStorage.test.ts',
  ],
  thresholds: {
    high: 80,
    low: 70,
    break: 65,
  },
  incrementalFile: 'reports/mutation/storage-bridges-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/storage-bridges.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/storage-bridges.json',
  },
};