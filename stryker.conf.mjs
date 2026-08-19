import base from './stryker.base.mjs';

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  ...base,
  mutate: [
    'src/lib/diceware.ts',
    'src/lib/emergencyKit.ts',
    'src/lib/otp.ts',
    'src/lib/random.ts',
    'src/lib/secretKey.ts',
    'src/lib/securityEvents.ts',
  ],
  testFiles: [
    'src/lib/diceware.test.ts',
    'src/lib/emergencyKit.test.ts',
    'src/lib/otp.test.ts',
    'src/lib/random.test.ts',
    'src/lib/secretKey.test.ts',
    'src/lib/securityEvents.test.ts',
  ],
  thresholds: {
    high: 80,
    low: 70,
    break: 65,
  },
  incrementalFile: 'reports/mutation/incremental.json',
};