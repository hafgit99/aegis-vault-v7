import base from './stryker.base.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  mutate: [
    'src/lib/csvParser.ts',
    'src/lib/fileDecoder.ts',
  ],
  testFiles: [
    'src/lib/importer.test.ts',
    'src/lib/csvParser.test.ts',
    'src/lib/fileDecoder.test.ts',
  ],
  thresholds: {
    high: 90,
    low: 87,
    break: 85,
  },
  incrementalFile: 'reports/mutation/importer-helpers-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/importer-helpers.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/importer-helpers.json',
  },
};