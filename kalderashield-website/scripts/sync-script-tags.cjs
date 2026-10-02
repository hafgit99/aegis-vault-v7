#!/usr/bin/env node
/* Keeps the script tags on every page in the right order.
 *
 * assets/js/i18n-apply.js owns the dictionary walk; site.js owns the loading,
 * the theme and the widgets. site.js throws on start if the first one is
 * missing, so the order is a real dependency and not a preference -- both tags
 * are `defer`, which runs them in document order, so putting the module first
 * is what guarantees it has executed by the time site.js reads it.
 *
 * This is a script rather than a find-and-replace because the dependency will
 * outlive the change that introduced it, and a page that quietly loads only one
 * of the two files fails at runtime instead of at build time.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');

const MODULE_TAG = '<script src="/assets/js/i18n-apply.js" defer></script>';
const SITE_TAG = '<script src="/assets/js/site.js" defer></script>';
const BOTH = `${MODULE_TAG}\n${SITE_TAG}`;

/* Generated pages go through jsdom, which writes a valueless attribute as
 * name="". Both spellings are valid and mean the same thing, so the tags are
 * matched either way -- but they are written back in the short form, so a
 * normalised page does not stay normalised. */
const MODULE_RE = /<script src="\/assets\/js\/i18n-apply\.js" defer(?:="")?><\/script>/;
const SITE_RE = /<script src="\/assets\/js\/site\.js" defer(?:="")?><\/script>/;
const PAIR_RE = /<script src="\/assets\/js\/i18n-apply\.js" defer(?:="")?><\/script>\r?\n\s*<script src="\/assets\/js\/site\.js" defer(?:="")?><\/script>/;

function htmlFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules' || entry.name === 'scripts') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.html')) out.push(full);
    }
  };
  walk(root);
  out.push(path.join(root, 'assets', 'templates', 'page.html'));
  return out;
}

function problems(html) {
  const out = [];
  if (html.includes(MODULE_TAG) && !html.includes(SITE_TAG)) {
    out.push('i18n-apply.js var ama site.js yok');
  }
  if (html.includes(MODULE_TAG) && html.includes(SITE_TAG)) {
    if (html.indexOf(MODULE_TAG) > html.indexOf(SITE_TAG)) {
      out.push('site.js i18n-apply.js ten once yukleniyor');
    }
    const moduleCount = html.split(MODULE_TAG).length - 1;
    if (moduleCount > 1) out.push(`i18n-apply.js ${moduleCount} kez var`);
  }
  return out;
}

const files = htmlFiles();
let changed = 0;
const issues = [];

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');

  if (check) {
    if (!html.includes(MODULE_TAG)) issues.push(`${rel}: i18n-apply.js yuklenmiyor`);
    else for (const p of problems(html)) issues.push(`${rel}: ${p}`);
    continue;
  }

  let next = html;
  if (next.includes(MODULE_TAG)) {
    // Replace the pair wherever it already is, so re-running does not append a
    // second copy.
    next = next.replace(PAIR_RE, BOTH);
  }
  if (!next.includes(MODULE_TAG)) {
    if (!next.includes(SITE_TAG)) {
      issues.push(`${rel}: site.js bulunamadi, eklenemedi`);
      continue;
    }
    next = next.replace(SITE_TAG, BOTH);
  }
  if (next === html) continue;
  fs.writeFileSync(file, next, 'utf8');
  changed++;
}

if (issues.length) {
  console.error('Script etiketi gecidi basarisiz:');
  for (const i of issues) console.error(' -', i);
  process.exit(1);
}

if (check) {
  console.log(`PASS - ${files.length} dosyada i18n-apply.js, site.js'ten once yukleniyor.`);
} else {
  console.log(`${changed} dosya guncellendi.`);
  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    const left = problems(html);
    if (left.length) console.log(`  ${path.relative(root, file).replace(/\\/g, '/')}: ${left.join('; ')}`);
  }
}