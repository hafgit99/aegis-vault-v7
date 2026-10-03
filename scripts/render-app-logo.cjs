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

const path = require('path');
const { readIconSource, renderSvgToPng } = require('./icon-render.cjs');

const root = path.resolve(__dirname, '..');

const TARGETS = [
  { size: 256, outPath: path.join(root, 'assets', 'KalderaShield-app-icon.png'), label: 'lock screen + sidebar logo' },
  { size: 128, outPath: path.join(root, 'public', 'splash-icon.png'), label: 'splash logo' },
];

(async () => {
  const svg = readIconSource(root);

  for (const { size, outPath, label } of TARGETS) {
    const { size: rendered, kb } = await renderSvgToPng({
      svg,
      width: size,
      height: size,
      outPath,
    });
    console.log(`  ${path.relative(root, outPath)} (${rendered}, ${kb} KB) - ${label}`);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});