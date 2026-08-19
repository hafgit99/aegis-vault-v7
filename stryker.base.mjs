/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',
  testRunner: 'vitest',
  coverageAnalysis: 'perTest',
  vitest: {
    configFile: 'vitest.config.ts',
    related: false,
  },
  ignorePatterns: [
    'src-tauri/target',
    'src-tauri/gen',
    'dist',
    'dist-extension',
    'dist-extension-firefox',
    'dist-extension-safari',
    'release-local',
    'node_modules',
    '.git',
  ],
  reporters: ['progress', 'clear-text', 'html', 'json'],
  timeoutMS: 15000,
  dryRunTimeoutMinutes: 3,
  concurrency: 2,
  cleanTempDir: 'always',
  ignoreStatic: true,
  tempDirName: '.stryker-tmp',
  incremental: true,
};