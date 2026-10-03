/**
 * Tests for the icon drift gate.
 *
 * The brand is one vector, src-tauri/icon-source/kalderashield-icon.svg, fanned
 * out across a dozen raster and XML surfaces: the Android launcher tile, the
 * adaptive-icon layers, the TV banner, the favicons, the lock screen, the
 * sidebar and the splash. Nothing compared them, so every drift this gate now
 * catches was found by looking at a built APK or a running app:
 *
 *   - `npm run icon:apply` defaulted to the pre-rebrand cyan/purple shield, so
 *     regenerating the icon set with no arguments reverted the launcher icon.
 *   - `tauri icon` writes src-tauri/icons/android, the template Gradle was
 *     initialised from. Gradle builds src-tauri/gen/android/app/src/main/res.
 *     Nothing copied one into the other, so a regeneration never reached the APK.
 *   - ic_launcher_background was #fff while the foreground layer already paints
 *     the dark squircle, giving a white tile with a dark tile inside it.
 *   - public/app-icon.png and public/favicon.ico were still the cyan files.
 *   - The splash drew an emerald Lucide ShieldCheck.
 *
 * The first test asserts the checked-in tree is clean, which is the whole point:
 * it fails the moment a surface is edited without `npm run icon:apply` following.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { collectIssues, pngSize, stripComments } = require('./verify-icons.cjs');

describe('verify-icons', () => {
  it('reports no drift in the checked-in tree', () => {
    expect(collectIssues()).toEqual([]);
  });
});

describe('stripComments', () => {
  it('removes block comments so history notes do not trip the palette check', () => {
    expect(stripComments('/* emerald */ .a { color: #4ade80 }')).not.toMatch(/emerald/);
  });

  it('removes line comments', () => {
    expect(stripComments('const url = "http://x"; // emerald')).not.toMatch(/emerald/);
  });

  it('leaves a palette reference in real markup alone', () => {
    expect(stripComments('.a { color: emerald }')).toMatch(/emerald/);
  });

  it('does not mistake a URL scheme for a line comment', () => {
    expect(stripComments('<img src="https://cdn/emerald.png" />')).toMatch(/emerald/);
  });
});

describe('pngSize', () => {
  it('reads the IHDR dimensions of a real icon', () => {
    expect(pngSize(path.resolve('src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png'))).toEqual({ width: 192, height: 192 });
    expect(pngSize(path.resolve('src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png'))).toEqual({ width: 432, height: 432 });
  });

  it('returns null for a file that is not a PNG', () => {
    expect(pngSize(path.resolve('src-tauri/tauri.conf.json'))).toBeNull();
  });

  it('returns null for a truncated buffer', () => {
    expect(pngSize(path.resolve('src-tauri/icon-source/kalderashield-icon.svg'))).toBeNull();
  });
});

describe('master vector', () => {
  it('is what every raster surface is rendered from', () => {
    const svg = readFileSync(path.resolve('src-tauri/icon-source/kalderashield-icon.svg'), 'utf8');
    // ks-bg is the obsidian plate; ADAPTIVE_ART_SCALE in android-icons.cjs is
    // derived from the artwork's own ks-bg mid-stop, quoted as #080a0f.
    expect(svg).toContain('#080a0f');
    // The magma core is the orange the splash palette is lifted from.
    expect(svg).toContain('#ff3d00');
  });
});