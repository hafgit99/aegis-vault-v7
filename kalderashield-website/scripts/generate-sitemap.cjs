#!/usr/bin/env node
/* Regenerates sitemap.xml for every address on the site.
 *
 * It grew by hand until each page had to be listed twice the moment every
 * language got its own URL: 23 pages became 276 addresses, and a hand-kept list
 * of that size is a list that quietly forgets entries. The per-page values are
 * read out of the existing sitemap and carried across to every locale of that
 * page, so the curation survives and only the repetition is generated.
 *
 * Two things are checked rather than assumed:
 *
 *   - every page that exists has a sitemap entry. A new page with no entry is
 *     invisible to search engines and there is no way to notice by reading the
 *     file.
 *   - every entry still has a page. A stale entry is a 404 in the index.
 *
 * Each <url> carries the full set of hreflang alternates. A sitemap that lists
 * twelve URLs without saying they are translations of each other gets them
 * indexed as twelve competing pages instead of one page in twelve languages.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const DOMAIN = '{{DOMAIN}}';
const SITE = path.join(root, 'sitemap.xml');

const locales = JSON.parse(fs.readFileSync(path.join(root, 'assets', 'locales.json'), 'utf8'));
const SOURCE = locales.source;
const ELIGIBLE = locales.eligible;
const PUBLISHED = locales.published;

const LOCALES = [SOURCE].concat(PUBLISHED);

/* Read the curated values back out of the file being replaced. Everything it
 * knows about a page is expressed as a path, so the same entry serves all
 * twelve locales of that page. */
const current = fs.readFileSync(SITE, 'utf8');

const byPath = new Map();
for (const block of current.match(/<url>[\s\S]*?<\/url>/g) || []) {
  const loc = block.match(/<loc>([^<]+)<\/loc>/);
  if (!loc) continue;
  let url = loc[1].replace(`https://${DOMAIN}`, '');

  /* Keyed by the unprefixed path, whichever locale the entry carried.
   *
   * Reading the file back verbatim made the gate fail on its own output: the
   * second run read back all 276 locale URLs, compared them against the 23
   * unprefixed pages on disk, and reported every one as an entry with no page. */
  for (const locale of PUBLISHED) {
    if (url === `/${locale}`) { url = '/'; break; }
    if (url.startsWith(`/${locale}/`)) { url = url.slice(locale.length + 1); break; }
  }

  if (!byPath.has(url)) {
    byPath.set(url, {
      changefreq: (block.match(/<changefreq>([^<]+)<\/changefreq>/) || [, 'monthly'])[1],
      priority: (block.match(/<priority>([^<]+)<\/priority>/) || [, '0.5'])[1],
    });
  }
}

/* The pages that exist now. The 404 is not one of them: it is noindex and has
 * no address worth listing. The generated locale trees are output of this same
 * pipeline, so they are skipped here and produced below by expanding each
 * unprefixed page across the twelve locales -- counting them as pages in their
 * own right would demand a hand-set entry for all 253 of them. */
const onDisk = new Set();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'assets' || entry.name === 'node_modules' || entry.name === 'scripts') continue;
    if (dir === root && LOCALES.includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.name.endsWith('.html')) continue;
    if (entry.name === '404.html') continue;
    const rel = '/' + path.relative(root, full).replace(/\\/g, '/');
    onDisk.add(rel.replace(/index\.html$/, ''));
  }
};
walk(root);

const problems = [];
for (const p of onDisk) {
  if (!byPath.has(p)) problems.push(`sitemap'te yok: ${p}`);
}
for (const p of byPath.keys()) {
  if (!onDisk.has(p)) problems.push(`sitemap'te var ama sayfa yok: ${p}`);
}

/* No stray top-level files, and no dotfile can become a published address. */
const stray = [...onDisk].filter((p) => /\.[a-z]+$/i.test(p) && !/\/(privacy|terms)\.html$/.test(p));
for (const p of stray) problems.push(`beklenmeyen dosya turu, adrese donustu: ${p}`);

if (problems.length) {
  console.error('Sitemap gecidi basarisiz:');
  for (const p of problems) console.error(' -', p);
  console.error('\nYeni sayfa eklerken sitemap.xml icin de bir giris lazim.');
  process.exit(1);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const locFor = (locale, pagePath) => {
  if (locale === SOURCE) return `https://${DOMAIN}${pagePath}`;
  return `https://${DOMAIN}/${locale}${pagePath === '/' ? '/' : pagePath}`;
};

// Homepage first, then the download page, then everything else alphabetically --
// a stable order means a regenerated file diffs in a readable way.
const ordered = [...onDisk].sort((a, b) => {
  const rank = (p) => (p === '/' ? 0 : p === '/download/' ? 1 : 2);
  return rank(a) - rank(b) || a.localeCompare(b);
});

const out = [];
for (const pagePath of ordered) {
  const { changefreq, priority } = byPath.get(pagePath);
  const alternates = ELIGIBLE
    .map((locale) => `    <xhtml:link rel="alternate" hreflang="${locale}" href="${esc(locFor(locale, pagePath))}"/>`)
    .concat([`    <xhtml:link rel="alternate" hreflang="x-default" href="${esc(locFor(SOURCE, pagePath))}"/>`])
    .join('\n');

  for (const locale of LOCALES) {
    out.push(
      '  <url>\n' +
        `    <loc>${esc(locFor(locale, pagePath))}</loc>\n` +
        `${alternates}\n` +
        `    <changefreq>${changefreq}</changefreq>\n` +
        `    <priority>${priority}</priority>\n` +
        '  </url>'
    );
  }
}

const document =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<!--\n' +
  '  Generated by scripts/generate-sitemap.cjs. One entry per address, so every\n' +
  '  language version is listed, and each entry declares the full hreflang set so\n' +
  '  the twelve are recognised as translations of one page rather than as twelve\n' +
  '  pages competing for the same query.\n' +
  '\n' +
  '  changefreq and priority are carried over from the hand-set values per page,\n' +
  '  so the only generated part is the repetition.\n' +
  '-->\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
  out.join('\n') +
  '\n</urlset>\n';

const eol = current.includes('\r\n') ? '\r\n' : '\n';
const next = eol === '\r\n' ? document.replace(/\n/g, '\r\n') : document;

if (next === current) {
  console.log(`sitemap guncel: ${onDisk.size} sayfa x ${LOCALES.length} dil = ${onDisk.size * LOCALES.length} adres`);
} else {
  fs.writeFileSync(SITE, next, 'utf8');
  console.log(`sitemap yeniden yazildi: ${onDisk.size} sayfa x ${LOCALES.length} dil = ${onDisk.size * LOCALES.length} adres`);
}