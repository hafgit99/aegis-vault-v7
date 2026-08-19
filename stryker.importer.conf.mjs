import base from './stryker.base.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  mutate: [
    'src/lib/importer.ts',
  ],
  testFiles: [
    'src/lib/importer.test.ts',
  ],
  thresholds: {
    high: 80,
    low: 70,
    break: 65,
  },
  incrementalFile: 'reports/mutation/importer-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/importer.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/importer.json',
  },
};