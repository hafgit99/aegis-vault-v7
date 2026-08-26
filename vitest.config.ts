import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'src-extension/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**', '.stryker-tmp/**', '.kilo/**', '**/.kilo/**', '.commandcode/**', '**/.commandcode/**'],
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
