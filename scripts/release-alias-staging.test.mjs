/**
 * Tests for the release pipeline's version-less alias staging.
 *
 * Runs under vitest (the scripts glob picks up *.test.mjs). This step is shell
 * inside a workflow, and shell in a workflow is only tested by a failing
 * release. It cost two in a row:
 *
 *   v7.0.12.0 -- the publish step rediscovered the aliases with a
 *     `release-local/*-latest.*` glob, and `*` does not match a leading
 *     uppercase `A`, so `AegisVault7-latest-linux-amd64.deb` and the Android and
 *     Safari aliases were never uploaded. The step still succeeded, so the
 *     release shipped three of seven and the website served 404s.
 *
 *   v7.0.13.0 -- the fix recorded staged files in the shell with
 *     `[ -f "${alias}.${ext}" ] && staged_files+=("${alias}.${ext}")`, and
 *     under `set -e` a trailing `test && append` whose test fails kills the
 *     step. A .deb alias has a .sig and no .sigstore.json, so the second
 *     iteration was a failing test and the step exited one line after its
 *     first success message.
 *
 * The second shipped despite the first having been "verified by running the
 * step's shell", because no fixture had a `.sig` without a `.sigstore.json`
 * next to it. So the fixtures below are the exact shapes a real release leaves
 * behind, and the script is extracted from the workflow rather than duplicated
 * -- a test that keeps its own copy of the code it is testing passes when the
 * workflow changes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WORKFLOW = path.resolve('.github/workflows/release-desktop.yml');

const ALIAS_STEP_HEADER = '      - name: Stage version-less aliases for stable download URLs';
const ALIAS_OUTPUT_DELIMITER = 'AEGIS_ALIAS_EOF';

/** What a full release stages, and what each artifact is signed with. */
const FIXTURE_FILES = [
  // Linux: Tauri-signed, so a .sig and no .sigstore.json. This pairing is what
  // broke v7.0.13.0.
  'linux/AegisVault7-7.0.13.0-linux-amd64.deb',
  'linux/AegisVault7-7.0.13.0-linux-amd64.deb.sig',
  'linux/AegisVault7-7.0.13.0-linux-x64.AppImage',
  'linux/AegisVault7-7.0.13.0-linux-x64.AppImage.sig',
  // Android and the extensions: cosign-signed, the opposite pairing.
  'android/app-universal-universal-release.apk',
  'android/app-universal-universal-release.apk.sigstore.json',
  'extensions/chrome/aegis-vault-7-chrome-v7.0.13.0.zip',
  'extensions/chrome/aegis-vault-7-chrome-v7.0.13.0.zip.sigstore.json',
  'extensions/edge/aegis-vault-7-edge-v7.0.13.0.zip',
  'extensions/edge/aegis-vault-7-edge-v7.0.13.0.zip.sigstore.json',
  'extensions/firefox/aegis-vault-7-firefox-v7.0.13.0.xpi',
  'extensions/firefox/aegis-vault-7-firefox-v7.0.13.0.xpi.sigstore.json',
  'extensions/safari/aegis-vault-7-safari-v7.0.13.0-webextension.zip',
  'extensions/safari/aegis-vault-7-safari-v7.0.13.0-webextension.zip.sigstore.json',
  // Never distributable. A staged list that widened to "everything in the
  // root" would start publishing these.
  'README.md',
  'SHA256SUMS.txt',
];

const EXPECTED_STAGED = [
  'release-local/AegisVault7-latest-linux-amd64.deb',
  'release-local/AegisVault7-latest-linux-amd64.deb.sig',
  'release-local/AegisVault7-latest-linux-x64.AppImage',
  'release-local/AegisVault7-latest-linux-x64.AppImage.sig',
  'release-local/aegis-vault-7-chrome-latest.zip',
  'release-local/aegis-vault-7-chrome-latest.zip.sigstore.json',
  'release-local/aegis-vault-7-edge-latest.zip',
  'release-local/aegis-vault-7-edge-latest.zip.sigstore.json',
  'release-local/aegis-vault-7-firefox-latest.xpi',
  'release-local/aegis-vault-7-firefox-latest.xpi.sigstore.json',
  'release-local/aegis-vault-7-safari-latest-webextension.zip',
  'release-local/aegis-vault-7-safari-latest-webextension.zip.sigstore.json',
  'release-local/aegis-vault-7-latest-universal.apk',
  'release-local/aegis-vault-7-latest-universal.apk.sigstore.json',
];

/** The `run:` body of the alias step, taken from the workflow itself. */
export function extractAliasScript(workflow) {
  const start = workflow.indexOf(ALIAS_STEP_HEADER);
  if (start === -1) throw new Error('alias step not found in the workflow');

  const afterName = workflow.indexOf('        run: |', start);
  if (afterName === -1) throw new Error('alias step has no run: block');

  const lines = workflow.slice(afterName).split('\n');
  const body = [];
  // The body is indented deeper than the step's own `run: |` line, so anything
  // at or below that indentation belongs to the next step.
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '' && body.length > 0) { body.push(''); continue; }
    if (!line.startsWith('          ')) break;
    body.push(line.slice(10));
  }
  return body.join('\n');
}

/**
 * Runs a bash script under the same working directory and environment the
 * workflow gives it, and returns its stdout plus the value it wrote to
 * $GITHUB_OUTPUT.
 */
export function runBash(script, cwd, env = {}) {
  const outputFile = path.join(cwd, 'github_output');
  writeFileSync(outputFile, '');

  // bash, not sh: the step uses arrays and process substitution. WSL is not used
  // deliberately -- a WSL bash would resolve paths differently from the runner.
  const candidates = [
    ['bash', ['-c', script]],
    ['C:/Program Files/Git/bin/bash.exe', ['-c', script]],
    ['C:/Program Files/Git/usr/bin/bash.exe', ['-c', script]],
  ];

  let lastError;
  for (const [command, args] of candidates) {
    try {
      const stdout = execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_OUTPUT: outputFile, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const raw = readFileSync(outputFile, 'utf8');
      const match = raw.match(
        new RegExp(`^staged<<(${ALIAS_OUTPUT_DELIMITER})\\n([\\s\\S]*?)\\n\\1$`, 'm'),
      );
      if (!match) throw new Error(`no staged output in GITHUB_OUTPUT:\n${raw}`);
      return { stdout, staged: match[2].split('\n').filter(Boolean) };
    } catch (error) {
      lastError = error;
      if (error && error.code === 'ENOENT') continue;
      // `bash` on this host without a working pipefail is a shell mismatch, not
      // a script failure; anything else is the script failing, and retrying it
      // under a different shell would hide that.
      if (/invalid option name/.test(String(error.stderr || error.message))) continue;
      throw error;
    }
  }
  throw lastError || new Error('no bash available to run the alias step');
}

let root;
let staged;
let stdout;

// Generous timeout: this hook forks a real bash and runs the step's shell
// against a staged tree. Five seconds on an idle machine, but CI runners and
// loaded dev boxes are slower, and a timeout here surfaces as a failed release
// rather than as a slow machine.
const ALIAS_SETUP_TIMEOUT_MS = 60_000;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'aegis-alias-'));
  for (const rel of FIXTURE_FILES) {
    const full = path.join(root, 'release-local', rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, `fixture:${rel}`);
  }
  const result = runBash(extractAliasScript(readFileSync(WORKFLOW, 'utf8')), root);
  staged = result.staged;
  stdout = result.stdout;
}, ALIAS_SETUP_TIMEOUT_MS);

afterAll(() => {
  // Windows and OneDrive can hold a handle on a fresh temp tree briefly; a
  // failed cleanup must not turn a passing test into a failing one.
  try {
    rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    // A leftover temp directory is harmless.
  }
});

describe('release alias staging', () => {
  it('extracts a runnable script from the alias step', () => {
    // Guard against the extraction silently returning nothing, which would
    // make every assertion below vacuously true.
    const script = extractAliasScript(readFileSync(WORKFLOW, 'utf8'));
    expect(script).toContain('link_alias');
    expect(script).toContain('AEGIS_ALIAS_EOF');
  });

  it('completes under set -euo pipefail', () => {
    // The v7.0.13.0 failure. Reaching this line at all is the assertion: the
    // script used to exit 1 right after the first `aliased` line.
    expect(stdout).toContain('AegisVault7-latest-linux-amd64.deb');
    expect(stdout).toContain('Staged 7 version-less alias(es).');
  });

  it('stages every alias the site links to', () => {
    expect((stdout.match(/^aliased /gm) || [])).toHaveLength(7);
  });

  it('hands publish exactly the staged files and their signatures', () => {
    expect([...staged].sort()).toEqual([...EXPECTED_STAGED].sort());
  });

  it('keeps a .sig next to an alias that has no .sigstore.json', () => {
    // The exact v7.0.13.0 regression: the second loop iteration's test failed,
    // and a trailing `test && append` under `set -e` ended the step.
    expect(staged).toContain('release-local/AegisVault7-latest-linux-amd64.deb.sig');
  });

  it('lists only files that exist', () => {
    for (const rel of staged) {
      expect(existsSync(path.join(root, rel)), `${rel} is listed but not on disk`).toBe(true);
    }
  });

  it('excludes non-distributable root files', () => {
    for (const name of ['README.md', 'SHA256SUMS.txt']) {
      expect(staged).not.toContain('release-local/' + name);
    }
  });

  it('lists release-local-relative paths, never bare names', () => {
    // A bare name would resolve against the runner's working directory instead
    // of the repository, and action-gh-release would skip it as quietly as the
    // glob did in v7.0.12.0.
    for (const rel of staged) {
      expect(rel.startsWith('release-local/'), rel).toBe(true);
    }
  });
});

describe('release alias wiring', () => {
  let workflow;

beforeAll(() => {
    workflow = readFileSync(WORKFLOW, 'utf8');
  });

  it('makes the publish step consume the staged list', () => {
    // The v7.0.12.0 failure: publish rediscovered the files with a glob.
    expect(workflow).toContain('steps.alias.outputs.staged');
  });

  it('leaves no alias glob in the publish step', () => {
    const start = workflow.indexOf('- name: Publish GitHub Release');
    expect(start).toBeGreaterThan(-1);
    const end = workflow.indexOf('\n      - name:', start + 10);
    const block = workflow.slice(start, end === -1 ? undefined : end);
    expect(block).not.toContain('*-latest.*');
  });

  it('gives the alias step an id for publish to reference', () => {
    expect(workflow).toMatch(/- name: Stage version-less aliases[^\n]*\n\s+id: alias/);
  });

  it('stages aliases before the checksum manifest is built', () => {
    // Otherwise the manifest the site tells users to verify against omits the
    // very files it links to.
    const aliasIdx = workflow.indexOf('- name: Stage version-less aliases');
    const shaIdx = workflow.indexOf('- name: Generate global SHA256SUMS.txt');
    expect(aliasIdx).toBeGreaterThan(-1);
    expect(shaIdx).toBeGreaterThan(-1);
    expect(aliasIdx).toBeLessThan(shaIdx);
  });
});
