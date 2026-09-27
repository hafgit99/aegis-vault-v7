/**
 * Tests for the Tauri updater manifest generator.
 *
 * Runs as a subprocess on purpose. What this test pins is the process exit
 * code, and a child process is the only honest way to assert that: importing
 * the module would run the generator as a side effect, and stubbing
 * `process.exit` would be testing the stub.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '..');

// A scratch staging directory, NOT the repository's own `release-local/`.
//
// Two reasons, both learned the hard way:
//
//  1. Correctness. `release-local/` is where the release pipeline stages the
//     artifacts it has just collected, and `desktop:release:gate` runs the unit
//     suite after collecting them. Pointed at the real directory, the "fails when
//     no signed artifact was collected" case found the release's own .sig files,
//     the generator exited 0, and the test failed — on the runner, in the release
//     gate, while passing everywhere else because a bare `npm run test:unit`
//     starts from a tree with no `release-local/` at all.
//  2. The blast radius. The old `afterEach` did `rm -rf` on the real
//     `release-local/`, so running the suite mid-release deleted the artifacts the
//     very next workflow step uploads. A test must not be able to do that.
const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aegis-updater-manifest-'));
const releaseLocal = path.join(stagingRoot, 'release-local');
const updaterDir = path.join(releaseLocal, 'updater');

// The exact marker the generator requires to accept a signature file. This is
// a string check, not real minisign verification -- the client does the actual
// cryptographic verification, which is why forging it here proves nothing about
// signature strength and is only used to exercise the happy path.
const TAURI_SIG_BODY =
  'untrusted comment: signature from tauri secret key\n' +
  'RWRCSzA2RWRFbmR5';

function run() {
  try {
    const stdout = execFileSync(process.execPath, [path.join(here, 'generate-updater-manifest.cjs')], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // The generator's staging directory, pointed at this test's scratch dir.
      env: { ...process.env, RELEASE_LOCAL_DIR: releaseLocal },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    };
  }
}

afterEach(() => {
  // Only ever the scratch directory. Never the repository's `release-local/`.
  fs.rmSync(releaseLocal, { recursive: true, force: true });
});

afterAll(() => {
  fs.rmSync(stagingRoot, { recursive: true, force: true });
});

describe('updater manifest generation', () => {
  it('fails when no signed artifact was collected', () => {
    // The finding this closes: `platforms: {}` was written with exit code 0, so
    // a release could ship with an auto-updater that offers every client
    // nothing. Reachable by a partial (Linux-only) release.
    fs.mkdirSync(releaseLocal, { recursive: true });

    const result = run();

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/no platform entries/i);
  });

  it('fails when artifacts exist but none carry a signature', () => {
    // Unsigned artifacts must never become an advertised update.
    fs.mkdirSync(path.join(releaseLocal, 'linux'), { recursive: true });
    fs.writeFileSync(path.join(releaseLocal, 'linux', 'aegis-vault-v7.AppImage'), 'binary');

    const result = run();

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/no platform entries/i);
  });

  it('fails when a .sig file is not a Tauri minisign signature', () => {
    // A random file called .sig must not be mistaken for a signature.
    const linuxDir = path.join(releaseLocal, 'linux');
    fs.mkdirSync(linuxDir, { recursive: true });
    fs.writeFileSync(path.join(linuxDir, 'aegis-vault-v7.AppImage'), 'binary');
    fs.writeFileSync(path.join(linuxDir, 'aegis-vault-v7.AppImage.sig'), 'not-a-signature');

    const result = run();

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/no platform entries/i);
  });

  it('succeeds and names the platform when a signed bundle is present', () => {
    const linuxDir = path.join(releaseLocal, 'linux');
    fs.mkdirSync(linuxDir, { recursive: true });
    fs.writeFileSync(path.join(linuxDir, 'aegis-vault-v7.AppImage'), 'binary');
    fs.writeFileSync(
      path.join(linuxDir, 'aegis-vault-v7.AppImage.sig'),
      TAURI_SIG_BODY,
    );

    const result = run();

    expect(result.code).toBe(0);
    const manifest = JSON.parse(
      fs.readFileSync(path.join(updaterDir, 'latest.json'), 'utf8'),
    );
    expect(Object.keys(manifest.platforms)).toContain('linux-x86_64');
    expect(manifest.platforms['linux-x86_64'].url).toMatch(/aegis-vault-v7\.AppImage$/);
  });
});
