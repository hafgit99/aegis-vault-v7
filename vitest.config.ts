import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: ['src/components/**/*.{ts,tsx}', 'src/hooks/**/*.{ts,tsx}', 'src/lib/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/main.tsx',
        'src/App.tsx',
        'src/types.ts',
        'src/types/**',
        'src/**/codegen-assets/**',
        'src/**/out/**',
      ],
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 65,
        branches: 70,
      },
    },
  },
});
