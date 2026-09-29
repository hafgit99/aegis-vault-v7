import { defineConfig } from 'vitest/config';

/**
 * Release-pipeline tests, run by `npm run test:release` and by the
 * verify-release-scripts job.
 *
 * Separate from vitest.config.ts on purpose. These tests fork a real bash and
 * run the release workflow's own shell, which is slow enough (5s on an idle
 * machine) to blow vitest's 10s hookTimeout when it runs alongside the 247
 * files of `test:unit` in parallel. Excluding the file from the unit run was
 * not enough: the `exclude` list also applies to a filtered CLI run, so
 * `vitest run <file>` then found nothing at all. A second config keeps both
 * properties -- it runs here, not there.
 */
export default defineConfig({
  test: {
    include: ['scripts/release-*.test.mjs'],
    // Nothing long-running, so a failure is a real failure rather than a slow
    // machine. The alias test also sets its own timeout for the bash fork.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
