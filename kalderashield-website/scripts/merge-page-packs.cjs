/* Merges the finished i18n-pages/<locale>.json translation packs into the
 * shared dictionaries.
 *
 *   node scripts/merge-page-packs.cjs de fr
 *
 * Merge-only and abort-on-collision: an existing key is reported and left
 * alone, so a re-run cannot silently overwrite reviewed copy. Any value that
 * is still byte-identical to its English source is reported as untranslated,
 * because a leftover English sentence is the failure this whole exercise is
 * meant to prevent.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const PACKS = path.join(root, 'i18n-pages');
const I18N = path.join(root, 'assets', 'js', 'i18n');

const locales = process.argv.slice(2);
if (!locales.length) {
  console.error('kullanim: node scripts/merge-page-packs.cjs <locale...>');
  process.exit(1);
}

const en = JSON.parse(fs.readFileSync(path.join(I18N, 'en.json'), 'utf8'));

for (const locale of locales) {
  const file = path.join(PACKS, locale + '.json');
  if (!fs.existsSync(file)) {
    console.warn(`ATLANDI: ${locale}.json yok`);
    continue;
  }

  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  const dictFile = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'));

  let added = 0;
  let skipped = 0;
  let untouched = [];

  for (const [key, value] of Object.entries(pack)) {
    if (typeof value !== 'string') continue;

    // A value identical to English means it was never translated.
    if (en[key] !== undefined && value === en[key]) untouched.push(key);

    if (Object.prototype.hasOwnProperty.call(dict, key)) {
      console.warn(`  ATLANDI (zaten var): ${locale}.${key}`);
      skipped++;
      continue;
    }
    dict[key] = value;
    added++;
  }

  fs.writeFileSync(dictFile, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  console.log(`${locale}.json -> ${Object.keys(dict).length} anahtar (eklendi ${added}, atlandi ${skipped})`);
  if (untouched.length) {
    console.log(`  CEVIRILMEMIS ${untouched.length} anahtar:`);
    for (const k of untouched.slice(0, 20)) console.log('    ' + k);
  }
  const stillMissing = [...Object.keys(en)].filter((k) => /^(p-|menu-)/.test(k) && !(k in dict));
  console.log(`  ${locale} icin eksik kalan: ${stillMissing.length}`);
}
