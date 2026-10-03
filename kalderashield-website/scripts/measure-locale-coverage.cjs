#!/usr/bin/env node
/* Decides which locales may have their own URLs, and fails the build when a
 * locale would ship a page it cannot actually fill.
 *
 * This gate exists because per-locale URLs turn a translation gap into a
 * duplicate-content problem instead of a cosmetic one. Under the old
 * client-side switching, a dictionary missing forty keys still produced one
 * indexable page that fell back to English for those strings. Once each locale
 * has an address, a half-translated dictionary produces a distinct URL that is
 * mostly someone else's content -- and search engines index it that way.
 *
 * Three counts per locale, and they answer different questions:
 *
 *   missing      keys the locale does not define at all. Never allowed; the
 *                page would render the English fallback and the URL would
 *                claim otherwise.
 *   empty        keys present but blank. Same outcome, harder to notice.
 *   untranslated values byte-identical to the source. Allowed, but only up to a
 *                share, because a language that copies the source everywhere is
 *                not translated and should not get an indexable URL.
 *
 * Identical values are not automatically wrong. Windows, Linux, AES-256-GCM,
 * 16 MB and the product's own name are the same in every language, and a
 * gate that failed on them would be failed on permanently and ignored. So the
 * check is a share, and the ones that are left over are listed for a human.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');

/* Kept out of assets/js/i18n/ on purpose. Everything in that directory is a
 * dictionary, and a config file sitting among them is read as a thirteenth
 * locale by anything that globs the folder -- audit-i18n did exactly that and
 * reported all 1378 keys as missing from "locales". */
const LOCALES_FILE = path.join(root, 'assets', 'locales.json');

/* Turkish is the language the hand-written pages ship in and the one the
 * unprefixed URLs stay in, so it is the source. */
const SOURCE = 'tr';
const RTL = new Set(['ar']);

/* Share of values allowed to be byte-identical to the source. Measured across
 * the current dictionaries the real figure is 30-43 keys, about 2.5%; every one
 * of those is a product name, a platform name or a unit. 12% leaves room for
 * legitimate overlaps and still fails a language that has not been started. */
const MAX_UNTRANSLATED_SHARE = 0.12;

const dicts = {};
for (const file of fs.readdirSync(I18N)) {
  if (!file.endsWith('.json')) continue;
  dicts[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(I18N, file), 'utf8'));
}

const source = dicts[SOURCE];
if (!source) throw new Error(`kaynak sozluk yok: ${SOURCE}`);
const keys = Object.keys(source);

const problems = [];
const report = [];

for (const [locale, dict] of Object.entries(dicts).sort()) {
  const missing = keys.filter((k) => !(k in dict));
  const extra = Object.keys(dict).filter((k) => !(k in source));
  const blank = keys.filter((k) => k in dict && !String(dict[k]).trim());
  const identical = locale === SOURCE ? [] : keys.filter((k) => k in dict && dict[k] === source[k]);
  const share = identical.length / keys.length;

  if (missing.length) problems.push(`${locale}: ${missing.length} anahtar tanimsiz (${missing.slice(0, 4).join(', ')})`);
  if (blank.length) problems.push(`${locale}: ${blank.length} anahtar bos (${blank.slice(0, 4).join(', ')})`);
  if (extra.length) problems.push(`${locale}: ${extra.length} fazladan anahtar (${extra.slice(0, 4).join(', ')})`);
  if (share > MAX_UNTRANSLATED_SHARE) {
    problems.push(`${locale}: degerlerin %${(share * 100).toFixed(1)}'i kaynakla ayni, esik %${MAX_UNTRANSLATED_SHARE * 100}`);
  }

  report.push({
    locale,
    dir: RTL.has(locale) ? 'rtl' : 'ltr',
    keys: keys.length,
    missing: missing.length,
    blank: blank.length,
    identical: identical.length,
    share,
    eligible: !missing.length && !blank.length && share <= MAX_UNTRANSLATED_SHARE,
    identicalKeys: identical,
  });
}

/* Every locale that passes gets a URL. Turkish is the one that stays
 * unprefixed, so it is not re-published under /tr/ as well. */
const eligible = report.filter((r) => r.eligible).map((r) => r.locale);
const published = eligible.filter((l) => l !== SOURCE);

console.log(`kaynak: ${SOURCE} · ${keys.length} anahtar · esik: %${MAX_UNTRANSLATED_SHARE * 100} ayni deger`);
console.log('');
for (const r of report) {
  console.log(
    `  ${r.locale.padEnd(3)} ${r.dir}  eksik=${String(r.missing).padStart(3)}  bos=${String(r.blank).padStart(2)}` +
    `  kaynakla ayni=${String(r.identical).padStart(3)} (%${(r.share * 100).toFixed(1)})` +
    `  ${r.eligible ? 'uygun' : 'KAPSAM YETERSIZ'}`
  );
}

if (process.argv.includes('--verbose')) {
  console.log('\n--- kaynakla ayni kalan degerler (bunlar cogunlukla ad, marka ve birim) ---');
  for (const r of report) {
    if (!r.identicalKeys.length) continue;
    console.log(`  ${r.locale}: ${r.identicalKeys.slice(0, 12).join(', ')}${r.identicalKeys.length > 12 ? ' …' : ''}`);
  }
}

console.log('');
if (problems.length) {
  console.error('Kapsam gecidi basarisiz:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}

console.log(`PASS - ${eligible.length} dil tam kapsamli.`);
console.log(`  isaretsiz (varsayilan): ${SOURCE}`);
console.log(`  yazili olarak uretilecek: ${published.join(', ')}`);
console.log(`  isaretsiz olarak uretilecek sayfa basina: 1 (${SOURCE}) + ${published.length} = ${eligible.length}`);

/* The locale list is consumed by the generator, so it is printed in a form it
 * can read back rather than duplicated in each script. */
fs.writeFileSync(LOCALES_FILE, JSON.stringify({
  source: SOURCE,
  rtl: [...RTL],
  eligible,
  published,
}, null, 2) + '\n', 'utf8');