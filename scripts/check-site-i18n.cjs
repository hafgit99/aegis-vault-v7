// Validates that every data-i18n key used in the site markup exists in all
// twelve translation files.
//
// A missing key is not a crash. The loader falls back to the text already in
// the markup, which is Turkish, so a typo silently shows Turkish to an English
// visitor. This makes that class of mistake loud instead.

const fs = require('fs');
const path = require('path');

const SITE = path.join(__dirname, '..', 'kalderashield-website');
const I18N = path.join(SITE, 'assets', 'js', 'i18n');

const dictionaries = {};
for (const file of fs.readdirSync(I18N).filter((f) => f.endsWith('.json'))) {
  dictionaries[file.replace('.json', '')] = JSON.parse(
    fs.readFileSync(path.join(I18N, file), 'utf8')
  );
}

const langs = Object.keys(dictionaries).sort();
let failures = 0;

function htmlFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) htmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

for (const file of htmlFiles(SITE).sort()) {
  const relative = path.relative(SITE, file);
  const html = fs.readFileSync(file, 'utf8');
  const used = new Set();

  for (const match of html.matchAll(/data-i18n="([^"]+)"/g)) used.add(match[1]);
  for (const match of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const pair of match[1].split(',')) {
      const parts = pair.split(':');
      if (parts[1]) used.add(parts[1].trim());
    }
  }

  if (used.size === 0) {
    console.log(`  ${relative}: ceviri anahtari yok`);
    continue;
  }

  const missing = new Set();
  for (const lang of langs) {
    for (const key of used) {
      if (!Object.prototype.hasOwnProperty.call(dictionaries[lang], key)) {
        missing.add(`${key} (${lang})`);
      }
    }
  }

  if (missing.size) {
    failures += 1;
    console.log(`  ${relative}: ${used.size} anahtar, ${missing.size} eksik`);
    [...missing].slice(0, 12).forEach((m) => console.log(`      eksik: ${m}`));
    if (missing.size > 12) console.log(`      ... ve ${missing.size - 12} tane daha`);
  } else {
    console.log(`  ${relative}: ${used.size} anahtar, ${langs.length} dilde tam`);
  }
}

if (failures) {
  console.log(`\n${failures} dosyada eksik ceviri var.`);
  process.exitCode = 1;
} else {
  console.log(`\nTum ceviri anahtarlari ${langs.length} dilde mevcut.`);
}
