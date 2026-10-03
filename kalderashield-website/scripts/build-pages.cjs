/* Generates the site's generated pages (/urun/*, /guvenlik/*, /platformlar/*,
 * /eklenti/, /kaynak-kodu/, /sss/) from content/pages/*.json.
 *
 * The published site has no build step: this script writes plain HTML that is
 * committed, exactly like the hand-written pages. It exists so a person can
 * edit one content file instead of maintaining seventeen pages across twelve
 * languages by hand.
 *
 *   node scripts/build-pages.cjs
 *
 * Every string in a page file lives under its locale, and each locale entry
 * also becomes an i18n key in assets/js/i18n/<lang>.json. The English entry is
 * written into the markup as the default text, so a page is readable even
 * before the locale dictionaries are fetched.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const CONTENT = path.join(root, 'content', 'pages');
const TEMPLATE = path.join(root, 'assets', 'templates', 'page.html');
const I18N = path.join(root, 'assets', 'js', 'i18n');

const LANGS = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'ar'];
const RTL = new Set(['ar']);

const DOMAIN_TOKEN = '{{DOMAIN}}';

/* Pages can set "section" to publish outside /urun/: section "guvenlik" with
 * slug "tehdit-modeli" lands on /guvenlik/tehdit-modeli/. A page whose slug
 * equals its section is the section's own landing page (/guvenlik/). Sections
 * default to "urun" so the existing product pages keep their addresses. */
function pageHref(page) {
  const section = page.section || 'urun';
  return section === page.slug ? `/${section}/` : `/${section}/${page.slug}/`;
}
const VERSION =
  (fs.readFileSync(path.join(root, 'index.html'), 'utf8').match(/data-site-version="([^"]+)"/) || [])[1] ||
  '7.0.18';

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Markup blocks keep their own HTML, so only the attribute values they carry
 * are escaped here; the paragraph text is escaped separately. */
const blocks = {
  what: (c, k) => c.what.map((p) => `<p data-i18n="${k}-p${c.what.indexOf(p) + 1}">${esc(p)}</p>`).join('\n        '),

  steps: (c, k) => `
      <h3 class="eyebrow" style="margin-top:2.2rem" data-i18n="${k}-steps-title">${esc(c.stepsTitle)}</h3>
      <div class="grid" style="margin-top:.9rem">
        ${c.steps
          .map(
            (s, i) => `<article class="card">
          <h3 data-i18n="${k}-step${i + 1}-title">${esc(s.title)}</h3>
          <p data-i18n="${k}-step${i + 1}-desc">${esc(s.desc)}</p>
        </article>`
          )
          .join('\n        ')}
      </div>`,

  heroShots: (c) =>
    c.heroShot
      ? `
      <figure class="shot-hero">
        <img class="shot" src="${c.heroShot.src}" width="${c.heroShot.w}" height="${c.heroShot.h}" loading="eager" decoding="async" alt="">
      </figure>`
      : '',

  shots: (c, k) => {
    if (!c.shots || !c.shots.length) return '';
    return `
  <section>
    <div class="wrap">
      ${c.shots
        .map(
          (s) => `<figure class="shot-pair">
        <img class="shot" src="${s.src}" width="${s.w}" height="${s.h}" loading="lazy" decoding="async" alt="">
        <figcaption>
          <h3 data-i18n="${k}-shot-title">${esc(s.title)}</h3>
          <p data-i18n="${k}-shot-desc">${esc(s.desc)}</p>
        </figcaption>
      </figure>`
        )
        .join('\n      ')}
    </div>
  </section>`;
  },

  tech: (c, k) => {
    if (!c.tech || !c.tech.length) return '';
    return `
      <div class="grid grid-3" style="margin-top:1.6rem">
        ${c.tech
          .map(
            (t, i) => `<article class="card">
          <span class="eyebrow">${esc(t.tag)}</span>
          <h3 data-i18n="${k}-tech${i + 1}-title">${esc(t.title)}</h3>
          <p data-i18n="${k}-tech${i + 1}-desc">${esc(t.desc)}</p>
        </article>`
          )
          .join('\n        ')}
      </div>`;
  },

  faq: (c, k) =>
    c.faq
      .map(
        (f, i) => `<details>
        <summary data-i18n="${k}-faq${i + 1}-q">${esc(f.q)}</summary>
        <p data-i18n="${k}-faq${i + 1}-a">${esc(f.a)}</p>
      </details>`
      )
      .join('\n      '),

  related: (c, k) => {
    if (!c.related || !c.related.length) return '';
    return `
      <h3 class="eyebrow" style="margin-top:2.4rem" data-i18n="${k}-rel-title">${esc(c.relatedTitle)}</h3>
      <div class="cta-row" style="margin-top:.8rem">
        ${c.related
          .map((r, i) => `<a class="btn btn-ghost" href="${r.href}" data-i18n="${k}-rel${i + 1}">${esc(r.label)}</a>`)
          .join('\n        ')}
      </div>`;
  },
};

/* The header navigation, written once.
 *
 * This used to exist twice. `megaMenu()` rendered the nav into the nineteen
 * generated pages and emitted three items -- Products, Security, Source -- while
 * `patchMenu()` wrote an eleven-item block into the two hand-written pages
 * between their markers. So every product, security, platform and FAQ page
 * shipped a header with no download link in it, no extensions link, no FAQ link
 * and no comparison link, and nothing failed: both functions were internally
 * correct, they simply disagreed, and no check compared their output.
 *
 * One function now, so a new item cannot reach the homepage and miss the other
 * nineteen pages. `pick` resolves a label from a dictionary and `fallbacks`
 * supplies the hardcoded text for a page whose dictionary has not loaded yet.
 *
 * `base` differs per caller and is not cosmetic. On the homepage a bare
 * "#features" resolves to the homepage's own anchor; on /urun/password-vault/
 * the same string would resolve to an anchor that does not exist there, so the
 * generated pages are rendered with base "/".
 */
function navMarkup({ base, pageList, pick, fallbacks }) {
  const label = (key) => esc(pick(key, fallbacks[key] || key));
  const href = (path) => `${base}${path}`;

  const panel = pageList
    .filter((p) => p.i18n.en.menuLabel)
    .map(
      (p) => `        <li><a href="${pageHref(p)}"><span class="menu-t" data-i18n="menu-${p.slug}">${label(
        'menu-' + p.slug
      )}</span><span class="menu-d" data-i18n="menu-d-${p.slug}">${label(
        'menu-d-' + p.slug
      )}</span></a></li>`
    )
    .join('\n');

  /* The download is the one thing the whole site exists to offer, so it is the
   * one nav item rendered as a button. The label sits in its own <span> because
   * site.js assigns with textContent when a translation carries no markup, which
   * would delete a glyph placed directly inside the anchor. */
  return `      <a href="${href('#features')}" data-i18n="nav-features">${label('nav-features')}</a>

      <details class="menu">
        <summary data-i18n="nav-products">${label('nav-products')}</summary>
        <div class="menu-panel">
          <ul>
${panel}
          </ul>
        </div>
      </details>

      <a href="/guvenlik/" data-i18n="nav-security">${label('nav-security')}</a>
      <a href="/eklenti/" data-i18n="nav-extensions">${label('nav-extensions')}</a>
      <a href="${href('#comparison')}" data-i18n="nav-comparison">${label('nav-comparison')}</a>
      <a href="/guvenlik/denetim-durumu/" data-i18n="nav-audit">${label('nav-audit')}</a>
      <a href="/sss/" data-i18n="nav-faq">${label('nav-faq')}</a>

      <details class="menu">
        <summary data-i18n="nav-source">${label('nav-source')}</summary>
        <div class="menu-panel menu-panel-sm">
          <ul>
            <li><a href="/kaynak-kodu/" data-i18n="footer-link-source">${label('footer-link-source')}</a></li>
            <li><a href="https://github.com/hafgit99/kalderashield/issues" rel="noopener noreferrer" data-i18n="footer-link-issues">${label('footer-link-issues')}</a></li>
            <li><a href="https://github.com/hafgit99/kalderashield/discussions" rel="noopener noreferrer" data-i18n="footer-link-discussions">${label('footer-link-discussions')}</a></li>
          </ul>
        </div>
      </details>

      <a class="nav-cta" href="/download/"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5v11"/><path d="M7.5 10.5l4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/></svg><span data-i18n="nav-download">${label(
    'nav-download'
  )}</span></a>`;
}

/* Readable default when no dictionary has loaded. The generated pages ship
 * English markup; index.html and download/index.html ship Turkish, which is why
 * the two fallback tables exist at all. */
const EN_FALLBACKS = {
  'nav-features': 'Features',
  'nav-products': 'Product',
  'nav-security': 'Security',
  'nav-extensions': 'Extensions',
  'nav-comparison': 'Comparison',
  'nav-audit': 'Audit',
  'nav-faq': 'FAQ',
  'nav-source': 'Source',
  'nav-download': 'Download',
  'footer-link-source': 'Source code',
  'footer-link-issues': 'Report an issue',
  'footer-link-discussions': 'Discussions',
};

const TR_FALLBACKS = {
  'nav-features': 'Özellikler',
  'nav-products': 'Ürün',
  'nav-security': 'Güvenlik',
  'nav-extensions': 'Eklentiler',
  'nav-comparison': 'Karşılaştırma',
  'nav-audit': 'Denetim',
  'nav-faq': 'SSS',
  'nav-source': 'Kaynak',
  'nav-download': 'İndir',
  'footer-link-source': 'Kaynak Kodları',
  'footer-link-issues': 'Hata Bildirimi',
  'footer-link-discussions': 'Tartışmalar',
};

/* The menu is derived from the pages that actually exist, so adding a page is
 * the only step needed to make it appear. Listing a link to a page that has
 * not been written yet would ship a 404 in the primary navigation. */
function megaMenu(dict, pageList) {
  return navMarkup({
    base: '/',
    pageList,
    pick: (k, f) => dict[k] || f,
    fallbacks: EN_FALLBACKS,
  });
}

/* The limits audit-page-meta enforces, applied here rather than left to fail.
 *
 * They are search-result constraints, not style rules: a title past about 70
 * characters is cut off in a result and a description past about 170 is
 * discarded. Turkish runs roughly ten percent longer than English for the same
 * sentence, so descriptions written comfortably inside the limit in English
 * landed over it in Turkish -- which is how five pages came to fail the moment
 * the unprefixed address became Turkish. Trimming the copy instead would fix
 * those five and leave the next translation to overshoot again.
 *
 * Cut at a word boundary where there is one. Japanese and Chinese have none,
 * and are cut outright rather than searched for a boundary that does not exist.
 */
function clamp(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).trim();
}

function render(page, locale, dict, pageList) {
  const src = page.i18n[locale] || page.i18n.en;
  const en = page.i18n.en;
  const k = 'p-' + page.slug;

  /* English is the fallback for the head rather than the locale's own copy:
     a title that exists in Turkish but not English would otherwise fall back
     to nothing, and every page in content/pages carries both. */
  const title = clamp(src.title || en.title, 70);
  const description = clamp(src.description || en.description, 170);

  const html = TEMPLATE_PARTS.body.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    switch (name) {
      case 'LANG': return locale;
      case 'DIR': return RTL.has(locale) ? 'rtl' : 'ltr';
      case 'VERSION': return VERSION;
      case 'DOMAIN': return DOMAIN_TOKEN;
      case 'SLUG': return page.slug;
      case 'CANONICAL': return pageHref(page);
      // The <head> follows the locale being written. Reading English here while
      // the body below renders Turkish produced a Turkish page titled in
      // English, and left /urun/x/ and /en/urun/x/ publishing the same English
      // head -- two addresses for one page, which is what the per-language URLs
      // exist to prevent.
      case 'TITLE': return esc(title);
      case 'OG_TITLE': return esc(title);
      case 'DESCRIPTION': return esc(description);

      case 'EYEBROW': return esc(src.eyebrow);
      case 'EYEBROW_KEY': return k + '-eyebrow';
      case 'H1': return src.h1;
      case 'H1_KEY': return k + '-h1';
      case 'LEAD': return esc(src.lead);
      case 'LEAD_KEY': return k + '-lead';
      case 'PRIMARY_LABEL': return esc(src.primary);
      case 'PRIMARY_KEY': return k + '-primary';
      case 'PRIMARY_HREF': return src.primaryHref || '/download/';
      case 'SECONDARY_LABEL': return esc(src.secondary);
      case 'SECONDARY_KEY': return k + '-secondary';
      case 'SECONDARY_HREF': return src.secondaryHref || 'https://github.com/hafgit99/kalderashield';

      case 'WHAT_LABEL': return esc(src.whatLabel);
      case 'WHAT_KEY': return k + '-what-label';
      case 'WHAT_TITLE': return esc(src.whatTitle);
      case 'WHAT_TITLE_KEY': return k + '-what-title';
      case 'WHAT_PARAS': return blocks.what(src, k);
      case 'STEPS': return blocks.steps(src, k);
      case 'HERO_SHOTS': return blocks.heroShots(src);
      case 'SHOTS': return blocks.shots(src, k);

      case 'SEC_TITLE': return esc(src.secTitle);
      case 'SEC_TITLE_KEY': return k + '-sec-title';
      case 'SEC_LABEL': return esc(src.secLabel);
      case 'SEC_LABEL_KEY': return k + '-sec-label';
      case 'SEC_BODY': return esc(src.secBody);
      case 'SEC_BODY_KEY': return k + '-sec-body';
      case 'TECH': return blocks.tech(src, k);

      case 'FAQ_TITLE': return esc(src.faqTitle);
      case 'FAQ_TITLE_KEY': return k + '-faq-title';
      case 'FAQ': return blocks.faq(src, k);
      case 'RELATED': return blocks.related(src, k);
      case 'MEGA_MENU': return megaMenu(dict, pageList);
      default: return '';
    }
  });

return (
      TEMPLATE_PARTS.doctype +
      '\n<!--\n' +
      '  Generated by scripts/build-pages.cjs from ' +
      path.basename(page.sourceFile || '') +
      '.\n' +
      '  Edit that content file and the dictionaries, not this page.\n' +
      '  The placeholder list lives in assets/templates/page.html.\n' +
      '-->\n' +
      html
    );
  }

/* Collects every data-i18n key the rendered markup uses and folds the
 * per-locale strings into the shared dictionaries, so the product pages and
 * the homepage stay on one translation system. */
function harvest(page) {
  const out = {};
  for (const [locale, src] of Object.entries(page.i18n)) {
    const k = 'p-' + page.slug;
    const d = (out[locale] = out[locale] || {});
    d[k + '-eyebrow'] = src.eyebrow;
    d[k + '-h1'] = src.h1;
    d[k + '-lead'] = src.lead;
    d[k + '-primary'] = src.primary;
    d[k + '-secondary'] = src.secondary;
    d[k + '-what-label'] = src.whatLabel;
    d[k + '-what-title'] = src.whatTitle;
    src.what.forEach((p, i) => (d[k + '-p' + (i + 1)] = p));
    d[k + '-steps-title'] = src.stepsTitle;
    src.steps.forEach((s, i) => {
      d[k + '-step' + (i + 1) + '-title'] = s.title;
      d[k + '-step' + (i + 1) + '-desc'] = s.desc;
    });
    (src.shots || []).forEach((s, i) => {
      d[k + '-shot-title'] = i === 0 ? s.title : undefined;
      d[k + '-shot-desc'] = i === 0 ? s.desc : undefined;
    });
    d[k + '-sec-title'] = src.secTitle;
    d[k + '-sec-label'] = src.secLabel;
    d[k + '-sec-body'] = src.secBody;
    (src.tech || []).forEach((t, i) => {
      d[k + '-tech' + (i + 1) + '-title'] = t.title;
      d[k + '-tech' + (i + 1) + '-desc'] = t.desc;
    });
    d[k + '-faq-title'] = src.faqTitle;
    src.faq.forEach((f, i) => {
      d[k + '-faq' + (i + 1) + '-q'] = f.q;
      d[k + '-faq' + (i + 1) + '-a'] = f.a;
    });
    if (src.relatedTitle) d[k + '-rel-title'] = src.relatedTitle;
    (src.related || []).forEach((r, i) => (d[k + '-rel' + (i + 1)] = r.label));
    Object.keys(d).forEach((key) => d[key] === undefined && delete d[key]);
  }
  return out;
}

/* The template opens with a comment that documents its placeholders, and those
 * placeholders are written as {{TOKEN}}. render() substitutes every {{TOKEN}} in
 * the file, comment included, so the documentation was replaced by the resolved
 * values -- which for {{WHAT_PARAS}} and {{STEPS}} means real page markup, and
 * enough of it to run the closing ---> down to line 75.
 *
 * The result rendered correctly, because a comment is invisible, and it went
 * unnoticed for that reason. What it cost was real: every generated page carried
 * a commented-out duplicate of its own body, roughly six kilobytes, downloaded by
 * every visitor and every crawler. One file held an entire stale copy of itself.
 *
 * So the comment stays in the template, where it documents the tokens for the
 * next person, and is dropped from the output, which carries a short note about
 * its own origin instead.
 */
const TEMPLATE_HEADER_RE = /^\s*(<!doctype html>)\s*<!--[\s\S]*?-->\s*/i;

function splitTemplate(html) {
  const m = html.match(TEMPLATE_HEADER_RE);
  if (!m) return { doctype: '<!doctype html>', body: html.replace(/^\s*<!doctype html>\s*/i, '') };
  return { doctype: m[1], body: html.slice(m[0].length) };
}

const TEMPLATE_HTML = fs.readFileSync(TEMPLATE, 'utf8');
const TEMPLATE_PARTS = splitTemplate(TEMPLATE_HTML);
const dicts = {};
for (const l of LANGS) {
  dicts[l] = JSON.parse(fs.readFileSync(path.join(I18N, l + '.json'), 'utf8'));
}

const files = fs.readdirSync(CONTENT).filter((f) => f.endsWith('.json')).sort();
const pageList = files.map((f) => {
    // Kept on the page so the generated file can name its own source, which is
    // the first thing anyone asks when a generated page looks wrong.
    const page = JSON.parse(fs.readFileSync(path.join(CONTENT, f), 'utf8'));
    page.sourceFile = f;
    return page;
  });

// Menu labels live in the same dictionaries as the page copy.
for (const page of pageList) {
  for (const [locale, src] of Object.entries(page.i18n)) {
    if (src.menuLabel) dicts[locale]['menu-' + page.slug] = src.menuLabel;
    if (src.menuDesc) dicts[locale]['menu-d-' + page.slug] = src.menuDesc;
  }
}

let pages = 0;
let strings = 0;

for (const page of pageList) {
  // Fold the page strings into the shared dictionaries first: the mega menu
  // reads its labels from there.
  const harvested = harvest(page);
  for (const [locale, entries] of Object.entries(harvested)) {
    for (const [key, value] of Object.entries(entries)) {
      if (typeof value !== 'string') continue;
      dicts[locale][key] = value;
      strings++;
    }
  }

  /* The unprefixed address is Turkish -- the language the hand-written pages
     ship in and the one the dictionaries are written against -- so the
     generated pages write Turkish too. The other eleven languages are separate
     documents written by scripts/generate-locales.cjs; writing them here as
     well would have been the old arrangement of twelve files per page, except
     without distinct addresses for any of them. */
  const outDir = path.join(root, page.section || 'urun', page.slug === (page.section || 'urun') ? '' : page.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), render(page, 'tr', dicts.tr, pageList), 'utf8');
  pages++;
  console.log(`${page.slug}: ${Object.keys(page.i18n).length} dil`);
}

for (const l of LANGS) {
  fs.writeFileSync(path.join(I18N, l + '.json'), JSON.stringify(dicts[l], null, 2) + '\n', 'utf8');
}

/* The long-form pages are written by hand for their body copy, but the primary
 * navigation has to list the product pages too. Rather than maintaining the
 * same dropdown twice, the block between the markers is regenerated from the
 * page list -- by navMarkup, the same function the generated pages use, so the
 * two cannot drift.
 *
 * `base` differs per file: on the homepage a bare "#features" works, but on a
 * page that is not the homepage the same link would resolve to that page's own
 * (absent) anchor, so it has to be "/#features". */
function patchMenu(file, base, pageList, dicts) {
  const START = '<!-- mega:start -->';
  const END = '<!-- mega:end -->';
  const html = fs.readFileSync(file, 'utf8');
  const a = html.indexOf(START);
  const b = html.indexOf(END);

  if (a === -1 || b === -1) {
    console.warn(`UYARI: ${path.relative(root, file)} icinde mega isaretleyicileri yok, menu guncellenmedi.`);
    return;
  }

  /* These two pages ship Turkish markup as their readable default, so the
   * labels prefer the Turkish dictionary and fall back to English where no
   * Turkish value exists yet. */
  const tr = (k, f) => dicts.tr[k] || dicts.en[k] || f;

  const block = '\n' + navMarkup({
    base,
    pageList,
    pick: tr,
    fallbacks: TR_FALLBACKS,
  }) + '\n      ';

  fs.writeFileSync(file, html.slice(0, a + START.length) + block + html.slice(b), 'utf8');
}

/* Four hand-written pages take the same block. 404.html is here because it used
 * to ship with no header at all, and a page whose menu is missing the download
 * cannot be counted as "every page". */
patchMenu(path.join(root, 'index.html'), '', pageList, dicts);
patchMenu(path.join(root, 'download', 'index.html'), '/', pageList, dicts);
patchMenu(path.join(root, '404.html'), '/', pageList, dicts);
console.log(`menuler guncellendi (${pageList.length} urun, 3 sayfa)`);

/* The sitemap is derived from the same page list, so a new page cannot be
 * shipped without its search entry. The {{DOMAIN}} token is left in place:
 * the real domain is a launch (Faz 6) decision and check-placeholders keeps
 * the token visible until it exists. */
function buildSitemap(pageList) {
  const sectionPriority = { urun: '0.8', guvenlik: '0.8', eklenti: '0.8', platformlar: '0.7', 'kaynak-kodu': '0.7', sss: '0.6' };
  const fixed = [
    { loc: '/', freq: 'weekly', pri: '1.0' },
    { loc: '/download/', freq: 'weekly', pri: '0.9' },
  ];
  const generated = pageList.map((p) => ({
    loc: pageHref(p),
    freq: 'monthly',
    pri: sectionPriority[p.section || 'urun'] || '0.7',
  }));
  const legal = [
    { loc: '/privacy.html', freq: 'yearly', pri: '0.3' },
    { loc: '/terms.html', freq: 'yearly', pri: '0.3' },
  ];

  const urls = [...fixed, ...generated, ...legal]
    .map(
      (u) => `  <url>
    <loc>https://${DOMAIN_TOKEN}${u.loc}</loc>
    <changefreq>${u.freq}</changefreq>
    <priority>${u.pri}</priority>
  </url>`
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  fs.writeFileSync(path.join(root, 'sitemap.xml'), xml, 'utf8');
  console.log(`sitemap guncellendi (${fixed.length + generated.length + legal.length} URL)`);
}

buildSitemap(pageList);

console.log(`\n${pages} sayfa · ${strings} i18n dizgesi · ${LANGS.length} dil guncellendi`);
