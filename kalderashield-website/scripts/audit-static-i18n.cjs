#!/usr/bin/env node
/* Asserts that every page already carries its own language.
 *
 * Each language has its own static document now, written by
 * generate-locales.cjs, so a data-i18n node's text should already be the
 * translated one before any script runs. This compares every node on all 277
 * pages against the dictionary for that page's own locale and fails on any
 * difference.
 *
 * It is the precondition for trusting the static pages at all. It has caught,
 * and would have kept catching:
 *
 *   - the closing calls to action on every generated page, which referenced
 *     keys no dictionary defined and so stayed English everywhere;
 *   - the hand-written pages, whose Turkish had drifted from tr.json in two or
 *     three dozen places per page and was being corrected by JavaScript a
 *     moment after load, so the served page, the crawled page and the
 *     dictionary were three different texts;
 *   - a sentence naming a real directory, release-local/<platform>/, which was
 *     assigned as innerHTML because it contained a <, and came out wrapped in
 *     an invented element.
 *
 * A node whose dictionary value contains a token is checked differently: the
 * page holds the filled-in number, so the comparison is on the token's absence
 * and the number's presence rather than on the raw string.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');

const dicts = {};
for (const file of fs.readdirSync(I18N)) {
  if (!file.endsWith('.json')) continue;
  dicts[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(I18N, file), 'utf8'));
}

/* Loaded rather than reimplemented, so the numbers this compares are produced
 * by the same code that filled them in. */
const { JSDOM: _unused } = { JSDOM };
const KS = (() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://placeholder.invalid/',
    runScripts: 'outside-only',
  });
  dom.window.eval(fs.readFileSync(path.join(root, 'assets', 'js', 'i18n-apply.js'), 'utf8'));
  return dom.window.KalderaShieldTranslate;
})();

/* Entities are decoded on the page's side. A dictionary value holds a literal
 * "&" -- "Güvenlik & Mimari Kriteri" -- while the markup carries "&amp;", so
 * comparing the raw strings reported every ampersand as a difference.
 *
 * &nbsp; matters for the test-count badge: French, Russian and Arabic separate
 * thousands with a non-breaking space, and the serialiser writes that character
 * as &nbsp;. Without decoding it, the one value that differs per locale was
 * reported on exactly the locales whose separators are spaces. */
const decode = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&apos;/g, "'")
  .replace(/&#0*160;/g, ' ').replace(/&nbsp;/g, ' ')
  .replace(/&#0*8239;/g, ' ').replace(/&thinsp;/g, ' ')
  .replace(/&amp;/g, '&');

const norm = (s) => decode(String(s)).replace(/\s+/g, ' ').trim();

const pages = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'assets' || entry.name === 'node_modules' || entry.name === 'scripts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.html')) pages.push(full);
  }
};
walk(root);

const problems = [];
let checked = 0;

for (const file of pages) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
  const doc = dom.window.document;
  const locale = doc.documentElement.getAttribute('lang');
  const dict = dicts[locale];

  if (!dict) {
    problems.push(`${rel}: lang="${locale}" icin sozluk yok`);
    continue;
  }

  const version = doc.documentElement.getAttribute('data-site-version') || '';
  const countMeta = doc.querySelector('meta[name="x-test-count"]');
  const count = countMeta ? parseInt(countMeta.getAttribute('content'), 10) : NaN;

  /* Mirrors applyText: version, then the test count formatted for this locale,
   * and a token with no value behind it is stripped rather than shown. */
  const expand = (s) => String(s)
    .split('{{VERSION}}').join(version)
    .split('{{TESTCOUNT}}').join(isFinite(count) ? KS.formatTestCount(count, locale) : '');

  /* innerHTML, not textContent: a value may carry markup -- <strong> in the
   * legal pages, <span class="gradient-text"> in the hero -- and applyText()
   * assigns innerHTML for exactly those. Comparing textContent stripped the tags
   * on one side only and reported 168 differences that were none. */
  for (const el of doc.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (!(key in dict)) {
      problems.push(`${rel} [${locale}]: "${key}" sozlukte yok, etiket Turkce/Ingilizce olarak kalir`);
      continue;
    }
    if (norm(el.innerHTML) !== norm(expand(dict[key]))) {
      problems.push(`${rel} [${locale}]: "${key}" sayfada sozlukten farkli`);
    }
  }

  for (const el of doc.querySelectorAll('[data-i18n-attr]')) {
    for (const pair of el.getAttribute('data-i18n-attr').split(',')) {
      const [attr, name] = pair.split(':').map((s) => (s || '').trim());
      if (!attr || !name) continue;
      if (!(name in dict)) {
        problems.push(`${rel} [${locale}]: "${name}" sozlukte yok`);
        continue;
      }
      if (el.getAttribute(attr) !== expand(dict[name])) {
        problems.push(`${rel} [${locale}]: "${name}@${attr}" sayfada sozlukten farkli`);
      }
    }
  }

  checked++;
  dom.window.close();
}

if (problems.length) {
  console.error(`Statik ceviri gecidi basarisiz: ${problems.length} bulgu\n`);
  for (const p of problems.slice(0, 40)) console.error(' -', p);
  if (problems.length > 40) console.error(` … ${problems.length - 40} bulgu daha`);
  process.exit(1);
}

console.log(`PASS - ${checked} sayfa zaten kendi dilinde; hicbir sayfa calisma zamani ceviriye bagli degil.`);