/* Merge one locale's homepage strings into its dictionary.
 *
 *   node scripts/merge-locale.cjs de ../i18n-packs/de.json
 *
 * Merge-only: an existing key is reported and left alone, so re-running is
 * safe and a partial translation pack cannot clobber reviewed copy. Keys in
 * the pack that the homepage no longer uses are reported too.
 */
const fs = require('fs');
const path = require('path');

const [locale, packPath] = process.argv.slice(2);
if (!locale || !packPath) {
  console.error('kullanim: node scripts/merge-locale.cjs <locale> <pack.json>');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const dictFile = path.join(root, 'assets', 'js', 'i18n', locale + '.json');
const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
const pack = JSON.parse(fs.readFileSync(path.resolve(packPath), 'utf8'));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const used = new Set();
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
  for (const part of m[1].split(',')) {
    const name = part.split(':')[1];
    if (name) used.add(name.trim());
  }
}

let added = 0;
let skipped = 0;
const unused = [];

for (const [key, value] of Object.entries(pack)) {
  if (!used.has(key)) { unused.push(key); continue; }
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    console.warn(`  ATLANDI (zaten var): ${locale}.${key}`);
    skipped++;
    continue;
  }
  dict[key] = value;
  added++;
}

fs.writeFileSync(dictFile, JSON.stringify(dict, null, 2) + '\n', 'utf8');

const stillMissing = [...used].filter((k) => !Object.prototype.hasOwnProperty.call(dict, k));
console.log(`${locale}.json -> ${Object.keys(dict).length} anahtar (eklendi ${added}, atlandi ${skipped})`);
if (unused.length) console.log('  pakette olup kullanimda olmayan: ' + unused.join(', '));
console.log(`  ${locale} icin eksik kalan: ${stillMissing.length}` + (stillMissing.length ? '\n    ' + stillMissing.join('\n    ') : ''));
