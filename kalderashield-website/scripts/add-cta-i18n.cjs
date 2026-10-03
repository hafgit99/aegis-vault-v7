#!/usr/bin/env node
/* Adds the two closing calls to action to the twelve dictionaries.
 *
 * Every generated page ends with a Download button and a Read the source link.
 * Both referenced keys that no dictionary defined, so the buttons carried their
 * English markup default in all twelve languages -- two English buttons at the
 * bottom of 229 pages, invisible because nobody reads English and a CTA at the
 * end of a page.
 *
 * They are added rather than repointed at an existing key. nav-source and
 * footer-link-source both exist and both translate, but using one would have
 * changed the English copy this button has always shown, and "Source Code" is
 * not what the sentence here is for.
 *
 * Idempotent: existing values are never overwritten, so a translator's wording
 * survives a re-run.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const LOCALES = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

const KEYS = {
  'cta-dl': {
    tr: 'İndir', en: 'Download', de: 'Herunterladen', fr: 'Télécharger',
    es: 'Descargar', it: 'Scarica', pt: 'Baixar', ru: 'Скачать',
    ja: 'ダウンロード', ko: '다운로드', zh: '下载', ar: 'تنزيل',
  },
  'cta-src': {
    tr: 'Kaynağı incele', en: 'Read the source', de: 'Quellcode ansehen',
    fr: 'Lire le code source', es: 'Leer el código fuente', it: 'Leggi il codice sorgente',
    pt: 'Ler o código-fonte', ru: 'Посмотреть исходный код', ja: 'ソースコードを見る',
    ko: '소스 코드 보기', zh: '查看源代码', ar: 'اطّلع على الشيفرة المصدرية',
  },
};

const problems = [];
for (const [key, byLocale] of Object.entries(KEYS)) {
  for (const locale of LOCALES) {
    if (typeof byLocale[locale] !== 'string' || !byLocale[locale].trim()) {
      problems.push(`${key}: ${locale} eksik`);
    }
  }
}
if (problems.length) {
  console.error('Ceviri tablosunda eksik deger:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}

let added = 0;
let kept = 0;

for (const locale of LOCALES) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));

  // Inserted beside the other call-to-action keys rather than appended, so the
  // dictionaries stay grouped the way a person reading one expects. These files
  // are diffed by hand and an unsorted append is easy to miss.
  const out = {};
  let placed = false;
  for (const [k, v] of Object.entries(dict)) {
    if (!placed && k.startsWith('cta-')) {
      for (const [key, byLocale] of Object.entries(KEYS)) {
        if (typeof dict[key] === 'string' && dict[key].trim()) { out[key] = dict[key]; kept++; }
        else { out[key] = byLocale[locale]; added++; }
      }
      placed = true;
    }
    out[k] = v;
  }
  if (!placed) {
    for (const [key, byLocale] of Object.entries(KEYS)) {
      if (typeof dict[key] === 'string' && dict[key].trim()) { out[key] = dict[key]; kept++; }
      else { out[key] = byLocale[locale]; added++; }
    }
  }

  fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n', 'utf8');
}

console.log(`${Object.keys(KEYS).length} anahtar · ${LOCALES.length} dil`);
console.log(`  eklendi: ${added}`);
console.log(`  mevcuttu, dokunulmadi: ${kept}`);