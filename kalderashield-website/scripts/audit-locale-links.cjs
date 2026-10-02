// Static audit: no localized page may link to an unprefixed page.
//
// This is the failure the browser test hit and it does not need a browser to
// see. A visitor on /de/download/ who clicks any internal link landed on the
// Turkish page, while the stored language preference kept the switcher showing
// German -- the page was Turkish and the control claimed otherwise.
//
// Files are not pages and must stay unprefixed: /assets/css/site.css,
// /site.webmanifest, /.well-known/security.txt. Rather than list the
// exemptions, this walks the site and asks whether the target exists in the
// unprefixed tree; if it does, it is a page and it has to carry the locale.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// This script already lives inside the site, so the root is one level up from
// scripts/ -- not a path built by walking back out and back in again.
const root = path.resolve(__dirname, '..');
const LOCALES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'zh'];

/* The unprefixed page addresses. */
const pages = new Set();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'assets' || entry.name === 'node_modules' || entry.name === 'scripts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dir === root && LOCALES.includes(entry.name)) continue;
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    if (entry.name === '404.html') continue;
    const rel = '/' + path.relative(root, full).replace(/\\/g, '/');
    pages.add(rel.replace(/index\.html$/, ''));
  }
};
walk(root);

const problems = [];
let links = 0;

for (const locale of LOCALES) {
  const localeDir = path.join(root, locale);
  if (!fs.existsSync(localeDir)) continue;

  const files = [];
  const collect = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) collect(full);
      else if (entry.name.endsWith('.html')) files.push(full);
    }
  };
  collect(localeDir);

  for (const file of files) {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const doc = new JSDOM(fs.readFileSync(file, 'utf8')).window.document;

    for (const el of doc.querySelectorAll('[href]')) {
      const href = el.getAttribute('href');
      if (!href || !href.startsWith('/')) continue;
      links++;
      // A page link with no locale prefix: the visitor leaves the language they
      // chose by clicking the site's own navigation.
      if (pages.has(href) && !href.startsWith('/' + locale + '/') && href !== '/' + locale) {
        problems.push(`${rel}: "${href}" yerel oneksiz`);
      }
    }
  }
}

if (problems.length) {
  console.error(`Yerel baglanti gecidi basarisiz: ${problems.length} bulgu\n`);
  const shown = [...new Set(problems.map((p) => p.split(': ').slice(1).join(': ')))];
  for (const p of shown.slice(0, 15)) console.error(' -', p);
  if (shown.length > 15) console.error(` … ${shown.length - 15} farkli hedef daha`);
  process.exit(1);
}

console.log(`PASS - ${LOCALES.length} dilde ${links} ic baglanti kontrol edildi; hicbiri yerel oneksiz degil.`);