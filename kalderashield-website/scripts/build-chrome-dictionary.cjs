#!/usr/bin/env node
/* Writes the small dictionary the browser still needs.
 *
 * Every page is now written in its own language at build time, so the browser
 * has no page text left to translate. What it does need is the three theme
 * labels, because the theme control is built by site.js after load and those
 * labels exist nowhere in the document until it runs.
 *
 * That is the whole list, and it is derived rather than listed here: the keys
 * are read out of the full dictionaries, which stay the single source of truth.
 * The twelve dictionaries are 130-165 KB each and the site used to fetch the
 * page's locale plus the English fallback -- up to about 300 KB per page view,
 * to re-apply text that was already correct.
 *
 * The output lands in chrome/ rather than beside the dictionaries. Everything in
 * assets/js/i18n/*.json is a dictionary, and audit-i18n reads that directory as
 * a list of locales; a second kind of file in it is read as a thirteenth
 * language.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const OUT = path.join(I18N, 'chrome');

/* site.js creates one button per theme and gives each the matching key. */
const REQUIRED = ['theme-system', 'theme-light', 'theme-dark'];

/* The aria-labels on the two header disclosures are already in the markup, in
 * the page's language, because the generator translated them. They are listed
 * only so a future change to which elements site.js owns cannot quietly drop
 * one: if a label moves into the built control it has to be added here too. */
const ALSO_IN_MARKUP = ['theme-switch-label', 'lang-switch-label', 'skip-link'];

const LOCALES = fs
  .readdirSync(I18N)
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.basename(f, '.json'))
  .sort();

const problems = [];
const keys = REQUIRED.concat(ALSO_IN_MARKUP);

const out = {};
for (const locale of LOCALES) {
  const dict = JSON.parse(fs.readFileSync(path.join(I18N, locale + '.json'), 'utf8'));
  const slice = {};
  for (const key of keys) {
    if (typeof dict[key] !== 'string' || !dict[key].trim()) {
      problems.push(`${locale}: "${key}" sozlukte yok`);
      continue;
    }
    slice[key] = dict[key];
  }
  out[locale] = slice;
}

if (problems.length) {
  console.error('Chrome sozlugu derlenemedi:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

let bytes = 0;
let wrote = 0;
for (const [locale, slice] of Object.entries(out)) {
  const file = path.join(OUT, locale + '.json');
  const body = JSON.stringify(slice, null, 2) + '\n';
  // Read in a try rather than testing existence first: existsSync() followed by
  // readFileSync() is a check-then-act pair, and CodeQL is right that the file
  // can change between the two. The catch covers the same ground -- a file that
  // is absent and a file that cannot be read both mean "write it".
  let current = null;
  try {
    current = fs.readFileSync(file, 'utf8');
  } catch {
    current = null;
  }
  if (current !== body) {
    fs.writeFileSync(file, body, 'utf8');
    wrote++;
  }
  bytes += Buffer.byteLength(body);
}

console.log(`${LOCALES.length} dil · ${keys.length} anahtar · ${wrote} dosya yazildi`);
console.log(`  toplam: ${(bytes / 1024).toFixed(1)} KB (eskiden sayfa basina 130-165 KB x 2)`);