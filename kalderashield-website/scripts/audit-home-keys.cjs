/* Reports which data-i18n keys the markup uses but the dictionary files lack. */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const used = new Set();
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
  for (const part of m[1].split(',')) {
    const name = part.split(':')[1];
    if (name) used.add(name.trim());
  }
}

const LANGS = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'ar'];
const dicts = {};
for (const l of LANGS) {
  dicts[l] = JSON.parse(fs.readFileSync(path.join(root, 'assets/js/i18n', l + '.json'), 'utf8'));
}

const missingByLang = {};
for (const l of LANGS) {
  missingByLang[l] = [...used].filter((k) => !Object.prototype.hasOwnProperty.call(dicts[l], k));
}

console.log('HTML anahtarlari:', used.size);
for (const l of LANGS) {
  console.log(`  ${l}.json eksik: ${missingByLang[l].length}`);
}
console.log('\n--- YENI ANAHTARLAR ---');
console.log([...used].filter((k) => !Object.prototype.hasOwnProperty.call(dicts.tr, k)).join('\n'));
