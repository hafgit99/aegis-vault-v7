// Shared SVG -> PNG renderer for the KalderaShield icon pipeline.
//
// Every brand surface (the lock screen logo, the Android TV banner) is drawn
// from src-tauri/icon-source/kalderashield-icon.svg by rasterising the master in
// a real browser, so the raster copies cannot drift from the vector. They all
// used to carry their own copy of the same chromium launch fallback, and one of
// them (render-app-logo.cjs) still does.
//
// Playwright ships no browser binary into node_modules and this repo pins no
// browser download step, so the bundled chromium is usually absent on a dev
// machine. An installed Edge or Chrome is always there. Falling back is not a
// convenience here: without it `npm run icon:apply` aborts at the render step
// and leaves the icon set half-written.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LAUNCH_CHANNELS = [undefined, 'msedge', 'chrome'];

async function launchBrowser() {
  let lastError;
  for (const channel of LAUNCH_CHANNELS) {
    try {
      return await chromium.launch(channel ? { channel } : {});
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `No usable browser for icon rendering (tried: bundled chromium, msedge, chrome). Last error: ${lastError?.message}`
  );
}

// Renders `svg` at width x height and writes it to `outPath`. `background` is
// applied to the page; pass 'transparent' with omitBackground to keep the alpha
// channel the icon needs.
async function renderSvgToPng({ svg, width, height, outPath, background = 'transparent', omitBackground = true, scale = 1 }) {
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: ${background}; }
  svg { display: block; width: ${width}px; height: ${height}px; }
</style></head>
<body>${svg}</body></html>`;

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({
      viewport: { width: Math.ceil(width), height: Math.ceil(height) },
      deviceScaleFactor: scale,
    });
    await page.setContent(html, { waitUntil: 'load' });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath, omitBackground, type: 'png' });
  } finally {
    await browser.close();
  }

  const size = `${Math.round(width * scale)}x${Math.round(height * scale)}`;
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  return { outPath, size, kb };
}

function readIconSource(rootDir) {
  const svgPath = path.join(rootDir, 'src-tauri', 'icon-source', 'kalderashield-icon.svg');
  if (!fs.existsSync(svgPath)) {
    throw new Error(`icon source not found: ${path.relative(rootDir, svgPath)}`);
  }
  return fs.readFileSync(svgPath, 'utf8');
}

module.exports = { launchBrowser, readIconSource, renderSvgToPng };