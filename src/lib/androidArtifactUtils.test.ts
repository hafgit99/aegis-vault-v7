import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  findLatestAndroidApk,
  findLatestAndroidCandidateArtifacts,
} = require('../../scripts/android-artifact-utils.cjs') as {
  findLatestAndroidApk: (repoRoot: string, options?: { buildType?: string }) => string;
  findLatestAndroidCandidateArtifacts: (repoRoot: string, options?: { buildType?: string }) => string[];
};

let tempRoots: string[] = [];

function createTempRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'aegis-android-artifacts-'));
  tempRoots.push(root);
  return root;
}

function writeArtifact(repoRoot: string, relativePath: string, timestamp: Date): string {
  const file = path.join(repoRoot, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', relativePath);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, 'artifact');
  utimesSync(file, timestamp, timestamp);
  return file;
}

afterEach(() => {
  for (const root of tempRoots) {
    rmSync(root, { recursive: true, force: true });
  }
  tempRoots = [];
});

describe('android artifact selection', () => {
  it('selects the newest APK for the requested build type', () => {
    const repoRoot = createTempRepo();
    writeArtifact(repoRoot, 'apk/universal/debug/app-universal-debug.apk', new Date('2026-01-01T00:00:00Z'));
    const newestDebug = writeArtifact(repoRoot, 'apk/aarch64/debug/app-aarch64-debug.apk', new Date('2026-01-02T00:00:00Z'));
    writeArtifact(repoRoot, 'apk/universal/release/app-universal-release.apk', new Date('2026-01-03T00:00:00Z'));

    expect(findLatestAndroidApk(repoRoot, { buildType: 'debug' })).toBe(newestDebug);
  });

  it('returns only the latest candidate per artifact extension', () => {
    const repoRoot = createTempRepo();
    const releaseApk = writeArtifact(repoRoot, 'apk/aarch64/release/app-aarch64-release.apk', new Date('2026-01-03T00:00:00Z'));
    const releaseAab = writeArtifact(repoRoot, 'bundle/release/app-release.aab', new Date('2026-01-02T00:00:00Z'));
    writeArtifact(repoRoot, 'apk/universal/release/app-universal-release.apk', new Date('2026-01-01T00:00:00Z'));
    writeArtifact(repoRoot, 'apk/aarch64/debug/app-aarch64-debug.apk', new Date('2026-01-04T00:00:00Z'));

    expect(findLatestAndroidCandidateArtifacts(repoRoot, { buildType: 'release' })).toEqual([
      releaseApk,
      releaseAab,
    ]);
  });
});
