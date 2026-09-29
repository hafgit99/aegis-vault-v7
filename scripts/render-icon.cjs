const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
  try {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1024, height: 1024, deviceScaleFactor: 1 } });
    const svgPath = path.resolve('src-tauri/icon-source/kalderashield-icon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');
    
    await page.setContent(`<!DOCTYPE html>
<html>
  <head>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body, html { width: 1024px; height: 1024px; overflow: hidden; background: transparent; }
      svg { width: 1024px; height: 1024px; display: block; }
    </style>
  </head>
  <body>
    ${svgContent}
  </body>
</html>`);

    await page.waitForTimeout(600);
    const outputPath = path.resolve('assets/KalderaShield-vector-icon.png');
    await page.screenshot({ path: outputPath, omitBackground: true });
    await browser.close();
    console.log('SUCCESS: Rendered', outputPath);
  } catch (err) {
    console.error('ERROR:', err);
    process.exit(1);
  }
})();
