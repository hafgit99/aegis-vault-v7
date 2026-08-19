import base from './stryker.base.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  mutate: [
    'src/lib/share.ts',
    'src/lib/recoveryKey.ts',
    'src/lib/backupValidation.ts',
    'src/lib/vaultDatabaseFormat.ts',
  ],
  testFiles: [
    'src/lib/share.test.ts',
    'src/lib/share.fuzz.test.ts',
    'src/lib/recoveryKey.test.ts',
    'src/lib/recoveryKey.fuzz.test.ts',
    'src/lib/backupValidation.test.ts',
    'src/lib/backupValidation.fuzz.test.ts',
    'src/lib/vaultDatabaseFormat.test.ts',
  ],
  thresholds: {
    high: 85,
    low: 75,
    break: 70,
  },
  incrementalFile: 'reports/mutation/security-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/security.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/security.json',
  },
};