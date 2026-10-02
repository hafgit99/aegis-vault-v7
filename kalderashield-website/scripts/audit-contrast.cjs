// Contrast gate. Walks the rendered pages and fails on any text whose computed
// contrast is under the WCAG AA threshold for its size and weight.
//
// It exists because the palette looked right in review and was wrong on screen:
// --text-faint was the quietest token on the page and the only one failing, at
// 4.22:1 against --bg-raised where every footer column heading sits. Three
// separate elements failed and all three shared one token, so a human reading
// the stylesheet would not have found it.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// This script already lives inside the site, so the root is one level up from
// scripts/ -- not a path built by walking back out and back in again.
const root = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.sh': 'text/plain' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(root, p);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});

const PAGES = ['/index.html', '/download/', '/urun/password-vault/', '/guvenlik/tehdit-modeli/', '/sss/', '/platformlar/windows/', '/privacy.html'];

(async () => {
  await new Promise((r) => server.listen(4197, r));
  let browser, last;
  for (const channel of [undefined, 'msedge', 'chrome']) {
    try { browser = await chromium.launch(channel ? { channel } : {}); break; } catch (e) { last = e; }
  }
  if (!browser) throw last;

  const findings = [];
  let checked = 0;

  /* Three states, not two. The one that matters is `toggled`: a visitor on a
     dark OS who picks light. A stylesheet can pass every agreeing combination
     and still fail there, because `prefers-color-scheme` stops applying the
     moment the site sets data-theme itself -- and the accent's light-mode
     overrides were written under the media query alone. */
  const STATES = [
    { name: 'dark', theme: 'dark', scheme: 'dark' },
    { name: 'light', theme: 'light', scheme: 'light' },
    { name: 'toggled', theme: 'light', scheme: 'dark' },
  ];

  for (const state of STATES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: state.scheme, reducedMotion: 'reduce' });
    for (const p of PAGES) {
      const page = await ctx.newPage();
      await page.addInitScript((t) => window.localStorage.setItem('kalderashield.site.theme', t), state.theme);
      const response = await page.goto('http://localhost:4197' + p, { waitUntil: 'networkidle' });
      // A 404 from the harness is the harness's own error page, not the site.
      // Measuring it would report findings against markup nothing ships.
      if (!response || response.status() >= 400) {
        console.log(`  atlandi (HTTP ${response ? response.status() : '?'}): ${p}`);
        await page.close();
        continue;
      }
      await page.waitForTimeout(300);

      const bad = await page.evaluate(() => {
        /* Chromium serialises a color-mix() result as `color(srgb 0.93 0.95 0.94)`
         * -- components in 0..1 -- while rgb() is 0..255. Reading both with the
         * same scale turned every colour-mix surface into near-black and produced
         * findings against markup that was fine. Two forms, two scales. */
        const parse = (value) => {
          const n = String(value).match(/[\d.]+/g);
          if (!n) return null;
          const scaled = /^\s*color\(/.test(String(value));
          const k = scaled ? 255 : 1;
          const a = n.length > 3 ? +n[3] : 1;
          return { r: +n[0] * k, g: +n[1] * k, b: +n[2] * k, a };
        };
        const lum = ({ r, g, b }) => {
          const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const out = [];
        const seen = new Set();

        for (const el of document.querySelectorAll('body *')) {
          // Only elements that render their own text.
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!own) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;

          const fg = parse(cs.color);
          if (!fg) continue;

          // Composite the text colour over the first opaque background behind it.
          let bgEl = el;
          let bg = null;
          while (bgEl) {
            const c = parse(getComputedStyle(bgEl).backgroundColor);
            if (c && c.a > 0) { bg = c; break; }
            bgEl = bgEl.parentElement;
          }
          if (!bg) bg = { r: 255, g: 255, b: 255, a: 1 };
          const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });

          const text = over(fg, bg);
          const [hi, lo] = [lum(text), lum(bg)].sort((x, y) => y - x);
          const ratio = (hi + 0.05) / (lo + 0.05);

          const size = parseFloat(cs.fontSize);
          const weight = +cs.fontWeight || 400;
          const large = size >= 24 || (size >= 18.66 && weight >= 700);
          const need = large ? 3 : 4.5;
          if (ratio >= need) continue;

          const key = el.tagName + '.' + (el.className || '').toString().slice(0, 24) + '|' + cs.color;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            sel: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''),
            ratio: +ratio.toFixed(2),
            need,
            size: cs.fontSize,
            weight,
            text: (el.textContent || '').trim().slice(0, 40),
          });
        }
        return out;
      });

      checked++;
      for (const b of bad) findings.push({ page: p, theme: state.name, ...b });
      await page.close();
    }
    await ctx.close();
  }

  console.log(`${checked} sayfa x ${STATES.length} tema durumu tarandi.`);
  if (!findings.length) {
    console.log('Durum: PASS - butun metinler WCAG AA esiginin uzerinde.');
  } else {
    console.log('');
    for (const f of findings) {
      console.log(`  ${f.theme.padEnd(5)} ${f.page.padEnd(30)} ${String(f.ratio).padStart(6)}:1 (min ${f.need})  ${f.size} w${f.weight}  ${f.sel}`);
      console.log(`        "${f.text}"`);
    }
    console.log(`\nDurum: FAIL - ${findings.length} bulgu.`);
  }

  await browser.close();
  server.close();
  process.exit(findings.length ? 1 : 0);
})();