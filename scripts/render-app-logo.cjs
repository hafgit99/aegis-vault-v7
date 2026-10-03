// Renders every in-app logo raster from the master vector.
//
// These are the assets the icon set never reached: tauri icon writes
// src-tauri/icons, the Android mipmaps and the iOS set, but the React tree and
// the HTML splash import from public/ and assets/ directly. Without this step
// the app keeps showing the previous mark on the lock screen, in the sidebar
// and on the splash after every other surface has changed.
//
// Sizes are chosen for where each one is actually drawn:
//   256px  assets/KalderaShield-app-icon.png  lock screen (40px/56px) and
//                                           sidebar (28px); 2x headroom
//   128px  public/splash-icon.png            index.html splash (96px), which
//                                           paints before the bundle is parsed

// Each render also writes `<out>.icon-source` beside the PNG, holding the
// sha256 of the SVG it was rasterised from. That is what proves the raster
// matches the master in CI, where no browser exists to re-render and compare.
// The gate compared mtimes instead, which is a coin flip: `git checkout` writes
// files in directory order, so kalderashield-icon.svg lands after the PNGs whose
// names sort before it, and the gate reported drift on a tree that was
// perfectly consistent -- failing CI on a clean checkout. A recorded hash is
// evidence; a timestamp is not.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { readIconSource, renderSvgToPng } = require('./icon-render.cjs');

const root = path.resolve(__dirname, '..');

const TARGETS = [
  { size: 256, outPath: path.join(root, 'assets', 'KalderaShield-app-icon.png'), label: 'lock screen + sidebar logo' },
  { size: 128, outPath: path.join(root, 'public', 'splash-icon.png'), label: 'splash logo' },
];

/* The sha256 of the master, normalised the way git stores it.
 *
 * git checks this file out with CRLF line endings on a Windows box with
 * core.autocrlf=true, while the blob in the repository is LF. Hashing the raw
 * bytes therefore produces a different digest on every developer machine than on
 * the Linux runner, and the stamp written here would not match the one the gate
 * computes there -- the gate would report drift on a tree that has none, on the
 * exact machine that is supposed to catch drift.
 *
 * Normalising CRLF to LF before hashing makes the digest a property of the
 * committed file rather than of who checked it out. It is the same thing git
 * does when it decides a file is unchanged.
 */
function masterDigest() {
  return crypto.createHash('sha256').update(normaliseEol(readIconSource(root))).digest('hex');
}

/* CRLF and lone CR both become LF, so the digest does not depend on how the
 * working tree happened to be checked out. */
function normaliseEol(source) {
  return source.replace(/\r\n?/g, '\n');
}

/* Written after a successful render, never before: a stamp beside a half-written
 * PNG would let the gate pass on a render that failed. */
function writeProvenance(outPath, digest) {
  fs.writeFileSync(outPath + '.icon-source', digest + '\n', 'utf8');
}

(async () => {
  const svg = readIconSource(root);
  const digest = masterDigest();

  for (const { size, outPath, label } of TARGETS) {
    const { size: rendered, kb } = await renderSvgToPng({
      svg,
      width: size,
      height: size,
      outPath,
    });
    writeProvenance(outPath, digest);
    console.log(`  ${path.relative(root, outPath)} (${rendered}, ${kb} KB) - ${label}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});