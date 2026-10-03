/* Regenerates src-extension/icons/*.png from the master SVG.
 *
 * These three files were committed long before the icon pipeline existed and
 * were never re-rendered from src-tauri/icon-source/kalderashield-icon.svg, so
 * the extension shipped the old cool-grey mark while the desktop, Android and
 * site surfaces all carried the current magma one. verify-icons.cjs checked the
 * Android mipmaps and the public copies but never this directory, which is how
 * the drift survived: the gate that exists to catch exactly this could not see
 * it.
 *
 * Sizes follow the manifest keys rather than the old filenames: `action.default_icon`
 * asks for 32/64/128, and the files it points at were 32x32, 64x64 and 128x128
 * under names that claimed 16/48/128. The 16/48 names are kept because renaming
 * them would be a breaking change for anyone holding a pinned copy of the old
 * build directory, and the manifest is what actually resolves.
 */
const fs = require('fs');
const path = require('path');
const { readIconSource, renderSvgToPng, launchBrowser } = require('./icon-render.cjs');

const root = path.resolve(__dirname, '..');
const ICONS = path.join(root, 'src-extension', 'icons');

const TARGETS = [
  { file: 'icon16.png', size: 32 },
  { file: 'icon48.png', size: 64 },
  { file: 'icon128.png', size: 128 },
];

async function main() {
  const svg = readIconSource(root);
  const browser = await launchBrowser();
  try {
    for (const { file, size } of TARGETS) {
      const outPath = path.join(ICONS, file);
      await renderSvgToPng({ svg, width: size, height: size, outPath });
      const bytes = fs.statSync(outPath).size;
      console.log(`${file} <- master @${size}x${size} (${bytes} bytes)`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});