import base from './stryker.base.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  mutate: [
    'src/lib/storage.ts',
  ],
  testFiles: [
    'src/lib/storageSession.test.ts',
  ],
  thresholds: {
    high: 90,
    low: 85,
    break: 85,
  },
  incrementalFile: 'reports/mutation/storage-orchestration-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/storage-orchestration.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/storage-orchestration.json',
  },
};