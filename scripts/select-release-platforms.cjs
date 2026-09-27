#!/usr/bin/env node
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Decides which desktop platforms a release run may publish.
 *
 * This is the most safety-critical decision in the release pipeline and it was
 * originally written as inline shell inside the workflow, where nothing can
 * test it. A mistake here either publishes something unsigned or silently ships
 * nothing, so it lives here instead, where the tests are.
 *
 * The rule that matters: **an unset variable selects every platform.** That
 * preserves the pre-existing fail-closed behaviour exactly. The failure mode to
 * avoid is the obvious-looking one where a missing variable quietly resolves to
 * "build nothing" -- a release job that skips every platform and publishes
 * nothing, reported as a green run.
 *
 * Linux is always included and can never be deselected: it is the one platform
 * whose artifacts need no certificate, and a release with no Linux build is not
 * a release. Naming it explicitly (`linux`) is how a release says "no desktop
 * certificates this time" -- and that token has to be *accepted*, not rejected
 * as a typo, or the only certificate-free route out of the pipeline is a dead
 * end that fails the whole release. See `RECOGNISED` below.
 *
 * Writes GitHub Actions outputs to stdout as `key=value` lines, and appends to
 * $GITHUB_OUTPUT when that environment variable is set.
 */

const SUPPORTED_OPTIONAL = ['macos', 'windows'];
const ALWAYS = 'linux';

/**
 * Tokens the selector accepts.
 *
 * This is deliberately NOT `SUPPORTED_OPTIONAL`. `linux` is a legal request that
 * simply adds nothing, because Linux is included unconditionally; treating it as
 * an unknown platform made `RELEASE_DESKTOP_PLATFORMS=linux` exit 1 -- while the
 * unit test `can narrow to a Linux-only release` happily passed, because
 * `selectReleasePlatforms` returns the right selection and only the CLI entry
 * point rejected the token. A test on the selection alone could never have
 * caught it. The distinguishing assertion is on `unknown`, and there is one now.
 */
const RECOGNISED = new Set([...SUPPORTED_OPTIONAL, ALWAYS]);

/**
 * @param {string|undefined|null} requested raw value of vars.RELEASE_DESKTOP_PLATFORMS
 * @returns {{selection: string, macos: boolean, windows: boolean, normalized: string, requestedWasUnset: boolean}}
 */
function selectReleasePlatforms(requested) {
  const raw = String(requested ?? '');
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '');

  // Unset, blank or the literal "all" all mean "every platform". This is the
  // fail-closed default and must not drift.
  const requestedWasUnset = normalized === '' || normalized === 'all';
  const optional = requestedWasUnset ? SUPPORTED_OPTIONAL : normalized.split(',').filter(Boolean);

  const unknown = optional.filter((name) => !RECOGNISED.has(name));

  const macos = optional.includes('macos');
  const windows = optional.includes('windows');

  // Deduplicate and put Linux first, always.
  const selection = [ALWAYS, macos ? 'macos' : null, windows ? 'windows' : null]
    .filter(Boolean)
    .join(',');

  return { selection, macos, windows, normalized, requestedWasUnset, unknown };
}

function main() {
  const result = selectReleasePlatforms(process.env.REQUESTED_PLATFORMS);
  const { selection, macos, windows, normalized, requestedWasUnset, unknown } = result;

  if (unknown.length > 0) {
    // Loud, not silent. A typo must not quietly produce a partial release.
    console.error(
      `::error::Unsupported platform(s) in RELEASE_DESKTOP_PLATFORMS: ${unknown.join(', ')}`
    );
    console.error(
      `::error::Supported: ${[...SUPPORTED_OPTIONAL, ALWAYS].join(', ')} (comma-separated), or "all". `
      + `${ALWAYS} is always built; naming it on its own is how a release ships without macOS/Windows certificates.`,
    );
    process.exit(1);
  }

  const outputs = {
    macos: String(macos),
    windows: String(windows),
    selection,
  };
  for (const [key, value] of Object.entries(outputs)) {
    console.log(`${key}=${value}`);
    if (process.env.GITHUB_OUTPUT) {
      require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  }

  console.log(
    `Requested platforms: ${
      requestedWasUnset ? '<unset> (defaulting to all)' : normalized
    } -> building: ${selection}`
  );

  if (!macos || !windows) {
    const excluded = [];
    if (!macos) excluded.push('macos');
    if (!windows) excluded.push('windows');
    console.log(
      `::warning::Partial desktop release: ${selection}. Not published: ${excluded.join(', ')}.`
    );
    console.log(
      '::warning::Those platforms get no auto-update offer and stay on their current version.'
    );
  }
}

if (require.main === module) main();

module.exports = { selectReleasePlatforms, ALWAYS, SUPPORTED_OPTIONAL, RECOGNISED };
