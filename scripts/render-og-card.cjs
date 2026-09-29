// Renders the social preview card the website points og:image at.
//
// The card is committed as a PNG rather than generated at deploy time, because
// a static site has no build step and a deploy that depended on a headless
// browser would be a new failure mode for a file that changes twice a year.
//
// Regenerate it after any branding change:
//
//   node scripts/render-og-card.cjs
//
// The previous card was carried over from the AegisVault site and still showed
// the old wordmark and the old green palette, so it was the one image on the
// new site that contradicted the product.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const WIDTH = 1200;
const HEIGHT = 630;

const root = path.resolve(__dirname, '..');
// icon.png is the 512px master the Tauri icon set is generated from. The
// numeric names (128x128.png and friends) are the platform-sized exports.
const iconPath = path.join(root, 'src-tauri', 'icons', 'icon.png');
const outPath = path.join(root, 'kalderashield-website', 'assets', 'images', 'og-card.png');

if (!fs.existsSync(iconPath)) {
  throw new Error(`icon not found: ${path.relative(root, iconPath)}`);
}

// The icon is a dark tile, so it reads as a mark rather than a picture when it
// sits on a matching ground.
const ICON = fs.readFileSync(iconPath).toString('base64');

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  :root {
    --bg: #08090e;
    --line: #1d2330;
    --text: #e9edf4;
    --muted: #9aa5b6;
    --accent: #ff7b2e;
    --accent-strong: #ffa261;
    --cyan: #22d3ee;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${WIDTH}px;
    height: ${HEIGHT}px;
    background:
      radial-gradient(900px 520px at 88% 112%, rgba(255, 77, 0, 0.20), transparent 62%),
      radial-gradient(700px 460px at 6% -14%, rgba(0, 242, 254, 0.10), transparent 60%),
      var(--bg);
    color: var(--text);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 74px 84px;
    position: relative;
    overflow: hidden;
  }
  /* A hairline inset, echoing the squircle rim in the app icon. */
  body::after {
    content: "";
    position: absolute;
    inset: 22px;
    border-radius: 34px;
    border: 1px solid rgba(255, 123, 57, 0.20);
    pointer-events: none;
  }
  .top { display: flex; align-items: center; gap: 22px; }
  .mark {
    width: 104px; height: 104px; border-radius: 26px;
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6);
  }
  .name {
    font-size: 50px; font-weight: 700; letter-spacing: -0.025em; line-height: 1;
  }
  .claim {
    font-size: 62px; font-weight: 700; letter-spacing: -0.03em; line-height: 1.08;
    max-width: 18ch;
  }
  /* One accent, held across the whole phrase. A gradient that shifts inside a
     word reads as two different colours in the middle of "device", and the
     cyan already has a job in the footer. */
  .claim em {
    font-style: normal;
    color: var(--accent-strong);
  }
  .tagline {
    margin-top: 26px;
    font-size: 27px; color: var(--muted); line-height: 1.4; max-width: 62ch;
  }
  .foot {
    display: flex; align-items: center; gap: 16px;
    font-size: 23px; color: var(--muted);
    border-top: 1px solid var(--line); padding-top: 26px;
  }
  .pill {
    display: inline-flex; align-items: center; gap: 10px;
    border: 1px solid var(--line); border-radius: 999px; padding: 8px 20px;
  }
  .pill i {
    width: 9px; height: 9px; border-radius: 50%; background: var(--accent);
    display: block;
  }
  .pill.on { border-color: rgba(0, 242, 254, 0.28); }
  .pill.on i { background: var(--cyan); }
</style>
</head>
<body>
  <div class="top">
    <img class="mark" src="data:image/png;base64,${ICON}" alt="">
    <div class="name">KalderaShield</div>
  </div>

  <div>
    <div class="claim">Your vault stays <em>on your device</em>.</div>
    <div class="tagline">
      A local-first, open-source password manager. No account, no server,
      and nothing to trust but the code in front of you.
    </div>
  </div>

  <div class="foot">
    <span class="pill"><i></i>AES-256-GCM</span>
    <span class="pill"><i></i>Argon2id</span>
    <span class="pill on"><i></i>Open source</span>
  </div>
</body>
</html>`;

// The machine this was written on has no Playwright-managed browser download,
// only the Edge that ships with Windows, which scripts/render-icon.cjs already
// drives. Try the bundled build first so this works on CI, then fall back to a
// channel rather than making every contributor install ~150 MB of Chromium.
const CHANNELS = [undefined, 'msedge', 'chrome'];

async function launch() {
  let lastError;
  for (const channel of CHANNELS) {
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
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.screenshot({ path: outPath, type: 'png' });
    const bytes = fs.statSync(outPath).size;
    console.log(`Wrote ${path.relative(root, outPath)} (${(bytes / 1024).toFixed(1)} KB, ${WIDTH}x${HEIGHT})`);
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
