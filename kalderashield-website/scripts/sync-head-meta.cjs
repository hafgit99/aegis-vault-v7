#!/usr/bin/env node
/* Keeps the head-level document metadata in step with the stylesheet.
 *
 * Two things it owns:
 *
 *   1. theme-color, as a prefers-color-scheme pair. One tag cannot serve both
 *      palettes, and the site has a working dark theme, so a single colour would
 *      paint the browser chrome the wrong shade for half the visitors. The
 *      values are read out of site.css rather than written here, so changing the
 *      palette cannot leave the chrome behind it.
 *
 *   2. rel="sitemap". robots.txt is the directive search engines read, but the
 *      link relation is what the rest of the toolchain follows, and it was the
 *      only way for a crawler to find the sitemap without a guess.
 *
 * Run with no arguments to write; with --check to fail the build instead. The
 * generated pages are produced from assets/templates/page.html, so the template
 * is in scope -- editing only the output would be undone by the next build.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');

const THEME_DARK = /<meta name="theme-color" content="[^"]*" media="\(prefers-color-scheme: dark\)">/;
const THEME_LIGHT = /<meta name="theme-color" content="[^"]*" media="\(prefers-color-scheme: light\)">/;
const SITEMAP = /<link rel="sitemap" href="[^"]*" type="application\/xml">/;

function palette() {
  const css = fs.readFileSync(path.join(root, 'assets', 'css', 'site.css'), 'utf8');
  // The dark palette is the bare :root; the light one is the data-theme block.
  // The @media duplicate is deliberately not consulted -- same values, and
  // matching it first would pick up an override rather than the palette.
  const dark = css.match(/^:root\s*\{([\s\S]*?)\n\}/m);
  const light = css.match(/^:root\[data-theme="light"\]\s*\{([\s\S]*?)\n\}/m);
  const read = (block, name) => {
    if (!block) return null;
    const m = block[1].match(new RegExp(`--${name}:\\s*(#[0-9a-f]{3,8})`, 'i'));
    return m ? m[1] : null;
  };
  const out = { dark: read(dark, 'bg'), light: read(light, 'bg') };
  if (!out.dark || !out.light) {
    throw new Error(`site.css icinden --bg okunamadi (dark=${out.dark} light=${out.light})`);
  }
  return out;
}

function htmlFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'scripts') continue;
        walk(full);
      } else if (entry.name.endsWith('.html')) out.push(full);
    }
  };
  walk(root);
  out.push(path.join(root, 'assets', 'templates', 'page.html'));
  return out;
}

function wanted(p) {
  return [
    `<meta name="theme-color" content="${p.dark}" media="(prefers-color-scheme: dark)">`,
    `<meta name="theme-color" content="${p.light}" media="(prefers-color-scheme: light)">`,
    `<link rel="sitemap" href="/sitemap.xml" type="application/xml">`,
  ];
}

function isManaged(line) {
  return THEME_DARK.test(line) || THEME_LIGHT.test(line) || SITEMAP.test(line);
}

/* Line-based on purpose. The first version removed the three tags with string
 * replacements and re-inserted them, which left the newline each removal
 * stranded behind: every run added three blank lines to the head of all
 * twenty-five files. Filtering whole lines cannot do that, and it makes the
 * result independent of how the file happens to be line-broken. */
function apply(html, tags) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const lines = html.split(/\r?\n/);

  const out = [];
  for (const line of lines) {
    if (isManaged(line)) continue;
    out.push(line);
  }

  const at = out.findIndex((l) => l.includes('name="viewport"'));
  if (at < 0) throw new Error('viewport meta satiri bulunamadi');
  out.splice(at + 1, 0, ...tags);

  // The block takes the place of a single blank line in the file's own spacing,
  // so the gap after it is normalised to exactly one. Dropping only one line per
  // run is what left six of them behind in the first place.
  let i = at + 1 + tags.length;
  if (i < out.length && out[i].trim() === '') {
    let j = i;
    while (j < out.length && out[j].trim() === '') j++;
    out.splice(i, j - i, '');
  }

  return out.join(eol);
}

const p = palette();
const tags = wanted(p);

if (check) {
  const problems = [];
  for (const file of htmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const missing = tags.filter((t) => !html.includes(t));
    if (missing.length) {
      problems.push(`${rel}: eksik -> ${missing.map((t) => t.slice(0, 60)).join(' , ')}`);
    }
    const stray = [THEME_DARK, THEME_LIGHT, SITEMAP].filter((re) => re.test(html)).length;
    const want = missing.length ? 3 - missing.length : 3;
    if (stray !== want) problems.push(`${rel}: eski/ek theme-color etiketi sayisi ${stray}, olmasi gereken ${want}`);
  }
  if (problems.length) {
    console.error('Head metadata gate failed:');
    for (const x of problems) console.error(' -', x);
    process.exit(1);
  }
  console.log(`PASS - tema rengi (${p.dark} koyu / ${p.light} aydinlik) ve sitemap baglantisi tum sayfalarda.`);
} else {
  let changed = 0;
  for (const file of htmlFiles()) {
    const html = fs.readFileSync(file, 'utf8');
    const next = apply(html, tags);
    if (next === html) continue;
    fs.writeFileSync(file, next, 'utf8');
    changed++;
  }
  console.log(`${changed} dosya guncellendi.`);
  console.log(`  tema rengi: ${p.dark} (koyu) / ${p.light} (aydinlik)`);
}