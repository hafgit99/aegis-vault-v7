// Renders the in-app logo at the size the lock screen actually displays it.
//
// src/components/LockScreen.tsx imports this file and draws it at 40px and
// 56px. The previous copy was 1024px and 656 KB, which is the number
// docs/COLD_START_PERFORMANCE_AUDIT.md already flagged. 256px keeps headroom
// for a 2x display at that size and lands around 20 KB.
//
// Run through `npm run icon:apply`, which is why this exists as its own step:
// the lock screen logo was the one place the icon set never reached, so the app
// shipped the lock screen in the old mark while every window, installer and
// launcher used the new one.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SIZE = 256;
const root = path.resolve(__dirname, '..');
const svgPath = path.join(root, 'src-tauri', 'icon-source', 'kalderashield-icon.svg');
const outPath = path.join(root, 'assets', 'KalderaShield-app-icon.png');

if (!fs.existsSync(svgPath)) {
  throw new Error(`icon source not found: ${path.relative(root, svgPath)}`);
}

const svg = fs.readFileSync(svgPath, 'utf8');

const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: ${SIZE}px; height: ${SIZE}px; }
</style></head>
<body>${svg}</body></html>`;

async function launch() {
  let lastError;
  for (const channel of [undefined, 'msedge', 'chrome']) {
    try {
      return await chromium.launch(channel ? { channel } : {});
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

(async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage({
      viewport: { width: SIZE, height: SIZE },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, omitBackground: true, type: 'png' });
    const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`[3/4] Wrote ${path.relative(root, outPath)} (${SIZE}x${SIZE}, ${kb} KB)`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
