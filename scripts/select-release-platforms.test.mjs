/**
 * Tests for release platform selection.
 *
 * Runs under vitest (the scripts glob picks up *.test.mjs). This decision
 * controls what a release is allowed to ship, so it gets a real test rather
 * than living as untested inline shell in the workflow.
 */
import { describe, expect, it } from 'vitest';

import { selectReleasePlatforms } from './select-release-platforms.cjs';

describe('release platform selection', () => {
  it('selects every platform when the variable is unset', () => {
    // The one that must never drift. Resolving a missing variable to "build
    // nothing" would produce a green run that publishes no desktop build.
    for (const unset of [undefined, null, '', '   ']) {
      const result = selectReleasePlatforms(unset);
      expect(result.selection).toBe('linux,macos,windows');
      expect(result.macos).toBe(true);
      expect(result.windows).toBe(true);
      expect(result.requestedWasUnset).toBe(true);
    }
  });

  it('treats the literal all as every platform, in any casing or spacing', () => {
    for (const all of ['all', 'ALL', 'All', ' all ']) {
      expect(selectReleasePlatforms(all).selection).toBe('linux,macos,windows');
    }
  });

  it('can narrow to a Linux-only release', () => {
    const result = selectReleasePlatforms('linux');
    expect(result.selection).toBe('linux');
    expect(result.macos).toBe(false);
    expect(result.windows).toBe(false);
  });

  it('accepts "linux" as a token instead of reporting it as a typo', () => {
    // The assertion that distinguishes the selection from the CLI. The test
    // above passed while the real workflow failed: `selectReleasePlatforms`
    // returned the right `selection`, and the *entry point* then exited 1
    // because `linux` was not in the accepted set. So `RELEASE_DESKTOP_PLATFORMS=linux`
    // — the one documented way to ship without desktop certificates — was a dead
    // end that failed the whole release, for as long as it was documented.
    //
    // `unknown` is the field the CLI gates on, so assert on that.
    expect(selectReleasePlatforms('linux').unknown).toEqual([]);
    expect(selectReleasePlatforms('linux,macos').unknown).toEqual([]);
    // A typo must still be rejected: over-correcting into "ignore what I don't
    // recognise" would ship a partial release nobody asked for.
    expect(selectReleasePlatforms('macos,windwos').unknown).toEqual(['windwos']);
  });

  it('can select a single optional platform', () => {
    expect(selectReleasePlatforms('macos').selection).toBe('linux,macos');
    expect(selectReleasePlatforms('windows').selection).toBe('linux,windows');
  });

  it('normalises casing, spacing and duplicate entries', () => {
    const result = selectReleasePlatforms(' MACOS , windows ,macos ');
    expect(result.selection).toBe('linux,macos,windows');
    expect(result.macos).toBe(true);
    expect(result.windows).toBe(true);
  });

  it('reports an unsupported platform instead of silently ignoring it', () => {
    // The over-correction: ignoring a typo would produce a partial release that
    // nobody asked for and that still looks green.
    const result = selectReleasePlatforms('macos,windwos');
    expect(result.unknown).toEqual(['windwos']);
    expect(result.selection).toBe('linux,macos');
  });

  it('always includes Linux regardless of what was asked for', () => {
    for (const requested of ['', 'all', 'macos', 'windows', 'macos,windows']) {
      expect(selectReleasePlatforms(requested).selection).toContain('linux');
    }
  });
});
