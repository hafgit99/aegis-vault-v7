// Finds text that no dictionary can ever translate.
//
// The comparison table shipped 20 Turkish cells with no data-i18n attribute
// while the four <th> above it had one, so the section looked translated and
// read as Turkish everywhere. That shape -- some children of a translated
// section wired up, others not -- is what this looks for: an element with real
// text of its own that no data-i18n attribute and no translated ancestor covers.
//
// The result is a review list, not a pass/fail gate. Plenty of untranslated
// text is correct: brand names, version numbers, "SHA-256", the product's own
// name. What it is for is finding the ones that are sentences.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// This script already lives inside the site, so the root is one level up from
// scripts/ -- not a path built by walking back out and back in again.
const root = path.resolve(__dirname, '..');

// Words that only appear in the Turkish copy. If a string contains one, it is
// almost certainly Turkish prose rather than a product name.
const TURKISH = /\b(de|gerek|veya|için|ile|olarak|bulut|yöneticileri|araçlar|kullanıcı|şifre|veri|kayıt|güven|destek|ücretsiz|kurulum|indir|sürüm|özellik|yönet|hakkında|neden|nasıl|nedir|içindekiler|tüm|daha|sonra|önce|şimdi|bir|bu|ile|de|da)\b/gi;

const LOCALES = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

function pages() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules' || entry.name === 'scripts') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Only the unprefixed tree: the locale copies are generated from it.
        if (dir === root && LOCALES.includes(entry.name)) continue;
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      const rel = path.relative(root, full).replace(/\\/g, '/');
      if (rel.startsWith('assets/') || rel === '404.html') continue;
      out.push({ rel, file: full });
    }
  };
  walk(root);
  return out;
}

const rows = [];

for (const { rel, file } of pages()) {
  const dom = new JSDOM(fs.readFileSync(file, 'utf8'));
  const doc = dom.window.document;

  for (const el of doc.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(el.tagName)) continue;

    // Only elements that render their own text.
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
    if (!own || own.length < 3) continue;

    // Covered by itself, by an ancestor, or by an attribute translation.
    if (el.closest('[data-i18n]')) continue;
    if (el.hasAttribute('data-i18n-attr')) continue;
    // A section that has no translated strings at all is out of scope.
    if (!el.closest('[data-i18n]') && !doc.querySelector('[data-i18n]')) continue;

    // Repeated boilerplate (footer columns, nav) is legitimately static here.
    if (el.closest('footer') || el.closest('nav')) continue;

    if (!TURKISH.test(own)) continue;
    TURKISH.lastIndex = 0;

    rows.push({
      page: rel,
      tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).trim().split(/\s+/)[0] : ''),
      text: own.replace(/\s+/g, ' ').slice(0, 70),
    });
    TURKISH.lastIndex = 0;
  }

  dom.window.close();
}

if (!rows.length) {
  console.log('PASS - ceviri etiketi tasimayan Turkce cumle bulunamadi.');
} else {
  const byPage = new Map();
  for (const r of rows) {
    if (!byPage.has(r.page)) byPage.set(r.page, []);
    byPage.get(r.page).push(r);
  }
  console.log(`${rows.length} aday · ${byPage.size} sayfa\n`);
  for (const [page, list] of byPage) {
    console.log(`  ${page}  (${list.length})`);
    for (const r of list.slice(0, 8)) console.log(`      ${r.tag.padEnd(26)} ${r.text}`);
    if (list.length > 8) console.log(`      … ${list.length - 8} daha`);
  }
}