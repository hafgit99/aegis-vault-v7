// Finishes the Android half of `npm run icon:apply`.
//
// `tauri icon` writes src-tauri/icons/android/**. That is the *template* the
// Gradle project was initialised from, not the directory Gradle actually
// builds: src-tauri/gen/android/app/src/main/res/** is. Nothing in the repo
// copied one into the other, so every icon regeneration had to be followed by a
// manual copy or the APK kept the previous mark. This script is that copy, plus
// the two things `tauri icon` writes wrong for this brand:
//
//   1. ic_launcher_background is #fff. The foreground PNG already paints the
//      obsidian squircle and is sized to sit inside the 66dp safe zone, so a
//      white background rendered as a white tile with a smaller dark tile inside
//      it. Rewritten to the artwork's own #080a0f mid-stop.
//
//   2. kalderashield_tv_banner.png was a grey/purple flat placeholder at
//      off-spec sizes (mdpi was 80x45). Regenerated on the documented banner
//      ladder with the caldera mark.
//
//   3. ic_launcher_foreground.png is redrawn. `tauri icon` drops the artwork
//      into the 108dp canvas at 58%, which is the bare safe-zone minimum: the
//      launcher showed a small mark floating in the middle of the tile. The art
//      is now scaled to 80% so the squircle bleeds past the 72dp mask -- the
//      launcher does the shaping, and there is no inner squircle edge -- while
//      the shield itself still lands inside the 66dp safe circle, so a circular
//      mask never clips it.
//
// It also deletes the Android Studio template leftovers that shipped in res/:
// drawable/ic_launcher_background.xml (green grid) and
// drawable-v24/ic_launcher_foreground.xml (the robot). Neither is referenced --
// mipmap-anydpi-v26/ic_launcher.xml points at @mipmap/ic_launcher_foreground and
// @color/ic_launcher_background -- and keeping them means a future launcher that
// does fall back to the drawable shows a green robot instead of the mark.

const fs = require('fs');
const path = require('path');
const { readIconSource, renderSvgToPng } = require('./icon-render.cjs');

const rootDir = path.resolve(__dirname, '..');
const iconsAndroidDir = path.join(rootDir, 'src-tauri', 'icons', 'android');
const genResDir = path.join(rootDir, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res');

// Mid-stop of ks-bg in src-tauri/icon-source/kalderashield-icon.svg.
const ICON_BACKGROUND = '#080a0f';

// Android TV banner: 320x180 at xhdpi is the documented reference size.
const TV_BANNER = [
  ['mdpi', 320, 180],
  ['hdpi', 480, 270],
  ['xhdpi', 640, 360],
  ['xxhdpi', 960, 540],
  ['xxxhdpi', 1280, 720],
];

// The adaptive-icon foreground layer is a 108dp canvas at every density.
const ADAPTIVE_FOREGROUND = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];

// The mask reveals 72dp of the 108dp layer and the safe circle is 66dp. At 78%
// the artwork is 84.24dp wide, so the squircle (94.5% of the artwork, 79.6dp)
// overruns the mask and the launcher does the shaping. The shield -- 71.97%
// tall and 54.30% wide inside it -- comes out at 60.6 x 45.8dp, which keeps its
// outer points inside the 72dp inscribed circle with a few dp to spare.
const ADAPTIVE_ART_SCALE = 0.78;

const STALE_TEMPLATE_RESOURCES = [
  'drawable/ic_launcher_background.xml',
  'drawable-v24/ic_launcher_foreground.xml',
];

function writeIconBackground() {
  const target = path.join(iconsAndroidDir, 'values', 'ic_launcher_background.xml');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `<?xml version="1.0" encoding="utf-8"?>
<!--
  Adaptive-icon background.

  \`tauri icon\` writes #fff here. That is the Android Studio default and it is
  wrong for this mark: ic_launcher_foreground.png already paints the obsidian
  squircle, sized to sit inside the 66dp safe zone instead of bleeding to the
  canvas edge. On a white background the launcher rendered a white tile with a
  smaller dark tile floating in the middle of it.

  ${ICON_BACKGROUND} is the artwork's own mid-stop (ks-bg in
  src-tauri/icon-source/kalderashield-icon.svg), so the foreground's squircle
  edge blends into whatever mask the launcher applies.

  scripts/android-icons.cjs rewrites this file after every \`tauri icon\` run.
-->
<resources>
  <color name="ic_launcher_background">${ICON_BACKGROUND}</color>
</resources>
`, 'utf8');
  return target;
}

function copyTree(from, to) {
  const copied = [];
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      copied.push(...copyTree(src, dst));
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      copied.push(path.relative(genResDir, dst).replace(/\\/g, '/'));
    }
  }
  return copied;
}

function syncIconsIntoGenRes() {
  if (!fs.existsSync(genResDir)) {
    throw new Error(`Gradle resource directory not found: ${path.relative(rootDir, genResDir)}. Run \`npm run android:init\` first.`);
  }
  return copyTree(iconsAndroidDir, genResDir);
}

function removeStaleTemplateResources() {
  const removed = [];
  for (const rel of STALE_TEMPLATE_RESOURCES) {
    const target = path.join(genResDir, ...rel.split('/'));
    if (fs.existsSync(target)) {
      fs.rmSync(target, { force: true });
      removed.push(rel);
    }
  }
  // drawable-v24 only held the robot vector; drop the directory rather than
  // leave an empty qualifier that suggests it is still in use.
  const drawableV24 = path.join(genResDir, 'drawable-v24');
  if (fs.existsSync(drawableV24) && fs.readdirSync(drawableV24).length === 0) {
    fs.rmSync(drawableV24, { recursive: true, force: true });
  }
  return removed;
}

function adaptiveForegroundSvg(iconSvg, canvas) {
  const art = canvas * ADAPTIVE_ART_SCALE;
  const offset = (canvas - art) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">
  <g transform="translate(${offset} ${offset}) scale(${art / 1024})">${iconSvg}</g>
</svg>`;
}

async function renderAdaptiveForegrounds() {
  const iconSvg = readIconSource(rootDir);
  const written = [];
  for (const [density, canvas] of ADAPTIVE_FOREGROUND) {
    const dir = path.join(iconsAndroidDir, `mipmap-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, 'ic_launcher_foreground.png');
    await renderSvgToPng({
      svg: adaptiveForegroundSvg(iconSvg, canvas),
      width: canvas,
      height: canvas,
      outPath,
    });
    written.push(path.relative(rootDir, outPath).replace(/\\/g, '/'));
  }
  return written;
}

// The launcher draws the app icon on top of the middle of a TV banner, so the
// mark sits on the left third and the centre stays clear.
function tvBannerSvg(iconSvg, width, height) {
  const mark = Math.round(height * 0.78);
  const markLeft = Math.round(width * 0.09);
  const markTop = Math.round((height - mark) / 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="banner-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0c0e14"/>
      <stop offset="55%" stop-color="#080a0f"/>
      <stop offset="100%" stop-color="#050609"/>
    </linearGradient>
    <radialGradient id="banner-glow" cx="24%" cy="50%" r="46%">
      <stop offset="0%" stop-color="#ff3d00" stop-opacity="0.30"/>
      <stop offset="45%" stop-color="#ff6d00" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#1a0400" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#banner-bg)"/>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#banner-glow)"/>
  <g transform="translate(${markLeft} ${markTop}) scale(${mark / 1024})">${iconSvg}</g>
</svg>`;
}

async function renderTvBanners() {
  const iconSvg = readIconSource(rootDir);
  const written = [];
  for (const [density, width, height] of TV_BANNER) {
    const dir = path.join(genResDir, `drawable-${density}`);
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, 'kalderashield_tv_banner.png');
    await renderSvgToPng({
      svg: tvBannerSvg(iconSvg, width, height),
      width,
      height,
      outPath,
      background: ICON_BACKGROUND,
      omitBackground: false,
    });
    written.push(path.relative(genResDir, outPath).replace(/\\/g, '/'));
  }
  return written;
}

async function main() {
  const backgroundFile = writeIconBackground();
  console.log(`  ic_launcher_background -> ${ICON_BACKGROUND} (${path.relative(rootDir, backgroundFile)})`);

  const foregrounds = await renderAdaptiveForegrounds();
  console.log(`  redrew ${foregrounds.length} adaptive-icon foreground layer(s) at ${ADAPTIVE_ART_SCALE * 100}% art scale`);

  const synced = syncIconsIntoGenRes();
  console.log(`  synced ${synced.length} launcher icon resource(s) into ${path.relative(rootDir, genResDir)}`);

  const removed = removeStaleTemplateResources();
  if (removed.length) {
    console.log(`  removed stale Android Studio template resource(s): ${removed.join(', ')}`);
  }

  const banners = await renderTvBanners();
  console.log(`  regenerated ${banners.length} Android TV banner(s) on the 320x180 ladder`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  ADAPTIVE_ART_SCALE,
  ADAPTIVE_FOREGROUND,
  ICON_BACKGROUND,
  STALE_TEMPLATE_RESOURCES,
  TV_BANNER,
  main,
  removeStaleTemplateResources,
  syncIconsIntoGenRes,
  writeIconBackground,
};