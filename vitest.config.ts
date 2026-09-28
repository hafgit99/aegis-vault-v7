import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src-extension/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.{mjs,js}'],
    exclude: [
      'node_modules/**',
      'dist/**',
      'tests/e2e/**',
      '.stryker-tmp/**',
      '.kilo/**',
      '**/.kilo/**',
      '.commandcode/**',
      '**/.commandcode/**',
      // Release-pipeline test, not an app unit test. It spawns a bash process to
      // run the workflow's own shell, and `test:unit` runs 247 files in parallel:
      // the spawn contends for CPU with everything else and blows vitest's 10s
      // default hookTimeout, failing a suite whose assertions never even ran.
      // It is run by `npm run test:release` and by the verify-release-scripts
      // job, which is where a release is actually gated.
      'scripts/release-alias-staging.test.mjs',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'src/components/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/lib/**/*.{ts,tsx}',
        'src/pages/**/*.{ts,tsx}',
        'src/UnlockedApp.tsx',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/main.tsx',
        'src/App.tsx',
        'src/types.ts',
        'src/types/**',
        'src/lib/vaultStorageRepository.ts',
        'src/**/codegen-assets/**',
        'src/**/out/**',
      ],
      thresholds: {
        lines: 90,
        statements: 88,
        functions: 85,
        branches: 80,
      },
    },
  },
});
