import base from './stryker.base.mjs';

/**
 * Mutation gate for the extracted SQLite OPFS storage layers:
 * shared row builder, persistence, legacy migration and the
 * row decryption engine.
 */
export default {
  ...base,
  mutate: [
    'src/lib/sqliteOpfsShared.ts',
    'src/lib/sqliteOpfsPersistence.ts',
    'src/lib/sqliteOpfsMigration.ts',
    'src/lib/sqliteOpfsRowDecryptor.ts',
  ],
  testFiles: [
    'src/lib/sqlite_opfs.test.ts',
    'src/lib/sqliteOpfsModules.test.ts',
    'src/lib/vaultDatabaseFormat.test.ts',
  ],
  thresholds: {
    high: 75,
    low: 60,
    break: 45,
  },
  incrementalFile: 'reports/mutation/storage-sqlite-incremental.json',
  htmlReporter: {
    fileName: 'reports/mutation/storage-sqlite.html',
  },
  jsonReporter: {
    fileName: 'reports/mutation/storage-sqlite.json',
  },
};
