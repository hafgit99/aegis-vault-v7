#!/usr/bin/env node
/* Writes one static document per locale.
 *
 * Why this exists
 * ---------------
 * The site used to have a single URL per page and swap the language with
 * JavaScript. That is fine for a visitor and useless to a search engine: twelve
 * languages shared one address, so a crawler indexed whichever one it happened
 * to render, and no page could ever be linked to in a specific language. A
 * Turkish reader with a link to the German download page had nowhere to send
 * it.
 *
 * The unprefixed URLs stay as they are and remain Turkish, which is the language
 * the hand-written pages ship in and the source the dictionaries are written
 * against. The other eleven get their own prefix. That keeps every existing
 * internal link and canonical valid -- there are no relative links in the
 * markup, so nothing has to be rewritten to survive the extra directory level --
 * and it avoids needing a redirect on "/", which a static host cannot serve.
 *
 * How a localized page is produced
 * --------------------------------
 * By applying assets/js/i18n-apply.js to the document with that locale's
 * dictionary -- the same code the browser runs, not a second implementation of
 * it. The output therefore needs no JavaScript to be readable, which is the
 * point: a crawler that does not execute scripts gets the right language
 * instead of the Turkish default.
 *
 * The pages carry their language in `lang`/`dir` and point `canonical` at
 * themselves, and each one lists every other locale through hreflang so the
 * twelve are recognised as translations of one page rather than as twelve
 * pages competing with each other.
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const structuredData = require('./lib/structured-data.cjs');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const LOCALES_FILE = path.join(root, 'assets', 'locales.json');
const DOMAIN = '{{DOMAIN}}';

if (!fs.existsSync(LOCALES_FILE)) {
  console.error('assets/locales.json yok. Once scripts/measure-locale-coverage.cjs calistir.');
  process.exit(1);
}
const locales = JSON.parse(fs.readFileSync(LOCALES_FILE, 'utf8'));
const SOURCE = locales.source;
const PUBLISHED = locales.published;

const dicts = {};
for (const locale of locales.eligible) {
  dicts[locale] = JSON.parse(fs.readFileSync(path.join(I18N, locale + '.json'), 'utf8'));
}

/* English doubles as the fallback dictionary, the same as at runtime, so a key
 * a locale is missing renders the English copy rather than the markup default. */
const FALLBACK = SOURCE === 'en' ? {} : dicts.en;

/* The translation core, loaded the way a browser loads it: from the published
 * file, not from a copy pasted here. */
/* `runScripts: 'outside-only'` is what gives the window a working `eval`. Without
 * it jsdom parses HTML but refuses to run any script, and the module would
 * silently define nothing. */
const KS = (() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://placeholder.invalid/',
    runScripts: 'outside-only',
  });
  dom.window.eval(fs.readFileSync(path.join(root, 'assets', 'js', 'i18n-apply.js'), 'utf8'));
  const api = dom.window.KalderaShieldTranslate;
  if (!api) throw new Error('i18n-apply.js KalderaShieldTranslate vermedi');
  return api;
})();

/* ---------------------------------------------------------------------------
 * Which files become pages, and what their addresses are
 * ------------------------------------------------------------------------ */

/* 404.html is not a page: it is noindex and has no address to translate. */
const SKIP = new Set(['404.html']);

function pages() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      if (entry.name === 'node_modules' || entry.name === 'scripts') continue;
      // The locale trees are output, not input. Without this the previous run's
      // /de/download/index.html would be collected as a source page and produce
      // /de/de/download/ on the next run.
      if (dir === root && PUBLISHED.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.html')) continue;
      const rel = path.relative(root, full).replace(/\\/g, '/');
      // Anything under assets/ is a template or a partial, never a page.
      if (rel.startsWith('assets/')) continue;
      if (SKIP.has(rel)) continue;
      out.push({ rel, file: full });
    }
  };
  walk(root);
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function urlPath(rel) {
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.slice(0, -'index.html'.length);
  return '/' + rel;
}

function fileFor(localePrefix, rel) {
  const relPath = urlPath(rel);
  const withoutLead = relPath.slice(1);
  const out = path.join(root, localePrefix, withoutLead);
  if (relPath.endsWith('/')) {
    fs.mkdirSync(out, { recursive: true });
    return path.join(out, 'index.html');
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  return out;
}

/* ---------------------------------------------------------------------------
 * Head rewriting
 * ------------------------------------------------------------------------ */

function localeUrl(locale, urlPathOf) {
  if (locale === SOURCE) return `https://${DOMAIN}${urlPathOf}`;
  // urlPathOf already starts with "/", and the prefix ends with one, so joining
  // them directly produced "/de//download/".
  return `https://${DOMAIN}/${locale}${urlPathOf}`;
}

function hreflangBlock(urlPathOf) {
  const lines = [];
  for (const locale of locales.eligible) {
    lines.push(`<link rel="alternate" hreflang="${locale}" href="${localeUrl(locale, urlPathOf)}">`);
  }
  // x-default is for visitors whose language is none of the twelve; it belongs
  // on the unprefixed page, which is Turkish.
  lines.push(`<link rel="alternate" hreflang="x-default" href="${localeUrl(SOURCE, urlPathOf)}">`);
  return lines.join('\n');
}

/* The whole hreflang block, with the newline each line leaves behind.
 *
 * Removing only the <link> and not its line terminator stranded a newline on
 * every run, so the head of all 253 generated pages grew one blank line each
 * time the generator was invoked -- which makes the output unstable and turns
 * the "is it reproducible" check in CI into noise. */
const ALTERNATE_RE = /[ \t]*<link rel="alternate"[^>]*>\r?\n?/g;

function replaceAlternates(head, block) {
  let inner = head.innerHTML.replace(ALTERNATE_RE, '');
  // Whatever the removals left behind is collapsed to a single separator, so the
  // result depends only on the block being written and not on how many times
  // the script has run before it.
  inner = inner.replace(/[\s\u00a0]+$/, '');
  head.innerHTML = inner + '\n' + block + '\n';
}

function applyHead(doc, rel, locale) {
  const p = urlPath(rel);
  const target = locale || SOURCE;
  const canonical = localeUrl(target, p);

  const link = doc.querySelector('link[rel="canonical"]');
  if (link) link.setAttribute('href', canonical);
  else {
    const head = doc.querySelector('head');
    head.insertAdjacentHTML('afterbegin', `<link rel="canonical" href="${canonical}">\n`);
  }

  // og:url has to agree with canonical; when they disagree a share preview can
  // point at a different locale than the page the reader is on.
  const ogUrl = doc.querySelector('meta[property="og:url"]');
  if (ogUrl) ogUrl.setAttribute('content', canonical);

  const head = doc.querySelector('head');
  replaceAlternates(head, hreflangBlock(p));
}

/* ---------------------------------------------------------------------------
 * Per-locale rendering
 * ------------------------------------------------------------------------ */

/* A localized page needs a localized <title> and meta description.
 *
 * There are no per-page title keys in the dictionaries -- the translation work
 * that exists covers headings, body copy and questions, and the <head> was
 * never part of it. Inventing German titles here would be worse than the gap,
 * so the title is derived from text that is genuinely translated on the page:
 * the localized <h1>, and the localized lead paragraph as the description. A
 * page whose <h1> did not change is left alone, because then there is no
 * translation to derive anything from and the original is still the best copy
 * available.
 *
 * og:title and og:description follow, since a share card that names the page in
 * a different language than the page itself reads as a mistake.
 */
const TITLE_SEPARATOR = ' — ';
const BRAND = 'KalderaShield';
const DESCRIPTION_LIMIT = 155;

/* Some headings already carry the brand -- "KalderaShield herunterladen",
 * "KalderaShield'i indirin". Appending the separator unconditionally produced
 * "KalderaShield herunterladen — KalderaShield" in every one of them.
 *
 * The length rule exists because Russian and Japanese headings run long once
 * translated, and appending the brand pushed five of them past the 70
 * characters audit-page-meta enforces -- the point where a search result starts
 * truncating. So the brand goes first, and only then is the text cut, which
 * keeps a heading intact whenever dropping the suffix is enough. */
const TITLE_LIMIT = 70;

function pageTitle(h1) {
  const hasBrand = h1.toLowerCase().indexOf(BRAND.toLowerCase()) !== -1;
  if (hasBrand) return clampTitle(h1);

  const withBrand = h1 + TITLE_SEPARATOR + BRAND;
  if (withBrand.length <= TITLE_LIMIT) return withBrand;
  return clampTitle(h1);
}

function clampTitle(text) {
  if (text.length <= TITLE_LIMIT) return text;
  const cut = text.slice(0, TITLE_LIMIT);
  const space = cut.lastIndexOf(' ');
  // A space to cut on means a word boundary. Japanese and Chinese titles have
  // none, and there is no word to preserve in them, so they are cut outright
  // rather than searched for a boundary that does not exist.
  return (space > TITLE_LIMIT * 0.6 ? cut.slice(0, space) : cut).trim();
}

function textOf(doc, selector) {
  const el = doc.querySelector(selector);
  if (!el) return '';
  // The heading may wrap a word in a span to highlight it; the browser shows the
  // text, so that is what belongs in a title.
  return el.textContent.replace(/\s+/g, ' ').trim();
}

function truncate(text, limit) {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  // Falling back to a hard cut rather than to a whole-word search that misses:
  // a description ending mid-word is a cosmetic flaw, an empty one is worse.
  return (space > limit * 0.6 ? cut.slice(0, space) : cut).trim();
}

/* Where a page's description comes from, in order of preference.
 *
 * The lead paragraph is the right source when there is one. The legal pages
 * have no lead, and without a fallback they kept the Turkish description in all
 * twelve languages while their headings and bodies translated normally -- the
 * same shape of bug as the comparison table, and one that only shows up when
 * someone reads the head of a page in a language they do not speak.
 *
 * A legal page's first real paragraph is a summary, which is what a meta
 * description is anyway, so falling back to it is honest rather than a
 * placeholder. */
function findDescription(doc) {
  const lead = doc.querySelector('.lead, .hero .lead, [data-i18n$="-lead"]');
  if (lead) return lead.textContent.replace(/\s+/g, ' ').trim();

  /* Otherwise the first substantial translated paragraph in the main content.
   *
   * "Substantial" is doing real work here. The legal pages open with a status
   * line -- "Last updated: October 2026 - Available in 12 languages." -- and
   * taking the first paragraph whatever it was gave every language's privacy
   * and terms pages that same line as their description: forty characters of
   * date, duplicated across two unrelated pages.
   *
   * A legal page's summary is the paragraph under its first heading, so that is
   * where the search falls once the lead is absent. */
  const main = doc.querySelector('main') || doc.body;
  if (!main) return '';

  const usable = (p) => {
    if (!p.hasAttribute('data-i18n')) return false;
    const text = p.textContent.replace(/\s+/g, ' ').trim();
    return text.length >= 40;
  };

  const firstHeading = main.querySelector('h2');
  if (firstHeading) {
    for (const p of firstHeading.parentElement.querySelectorAll('p')) {
      if (usable(p)) return p.textContent.replace(/\s+/g, ' ').trim();
    }
  }
  for (const p of main.querySelectorAll('p')) {
    if (usable(p)) return p.textContent.replace(/\s+/g, ' ').trim();
  }
  return '';
}

function localiseHead(doc, sourceH1) {
  const h1 = textOf(doc, 'h1');
  const title = doc.querySelector('title');
  const ogTitle = doc.querySelector('meta[property="og:title"]');
  const desc = doc.querySelector('meta[name="description"]');
  const ogDesc = doc.querySelector('meta[property="og:description"]');

  let changed = false;

  // The title and the description are decided separately. Requiring a changed
  // heading before touching either meant a page whose heading happens to read
  // the same in two languages kept a description that was still Turkish.
  if (h1 && h1 !== sourceH1) {
    const value = pageTitle(h1);
    if (title) title.textContent = value;
    if (ogTitle) ogTitle.setAttribute('content', value);
    changed = true;
  }

  const source = findDescription(doc);
  if (source) {
    const value = truncate(source, DESCRIPTION_LIMIT);
    if (desc) desc.setAttribute('content', value);
    if (ogDesc) ogDesc.setAttribute('content', value);
    changed = true;
  }

  return changed;
}

/* jsdom serialises a valueless attribute as name="". Both forms mean the same
 * thing in HTML, but the hand-written pages use the short one, and leaving the
 * difference in place means every generated page and every page this script
 * re-serialises carries a cosmetic diff against the version a human edited.
 * Only these attributes are collapsed -- they are the boolean ones, where the
 * empty value is redundant by definition. */
const BOOLEAN_ATTRS = [
  'defer', 'async', 'checked', 'selected', 'disabled', 'readonly', 'required',
  'multiple', 'hidden', 'open', 'novalidate', 'autofocus', 'playsinline',
  'default', 'ismap', 'reversed', 'loop', 'muted', 'controls',
];

function normalise(html) {
  let out = html;
  for (const attr of BOOLEAN_ATTRS) {
    out = out.replace(new RegExp(`\\s${attr}=""(?=[\\s/>])`, 'g'), ` ${attr}`);
  }
  return out;
}

function render(html, locale, rel, sourceH1) {
  const dom = new JSDOM(html, {
    url: 'https://placeholder.invalid/' + (locale === SOURCE ? '' : locale + '/') + urlPath(rel),
  });
  const doc = dom.window.document;

  KS.setDocumentLang(doc, locale);
  KS.translate(doc, doc, { dictionary: dicts[locale], fallbackDictionary: FALLBACK, locale });

  const retitled = localiseHead(doc, sourceH1);
  applyHead(doc, rel, locale);

  // Structured data goes in last, so it is built from the translated document
  // and describes exactly what the page will show. See the module header.
  structuredData.forPage(doc, {
    locale,
    source: SOURCE,
    pagePath: urlPath(rel),
    homePath: '/',
    dict: dicts[locale],
    description: (doc.querySelector('meta[name="description"]') || {}).content || '',
  });

  return { html: normalise(dom.serialize()), retitled };
}

const list = pages();
let written = 0;
let retitled = 0;
const problems = [];

/* Remove the whole prefix tree first. Regenerating into it would leave pages
 * behind for any locale that has dropped out of the list -- and a stale
 * /de/download/ with no hreflang pointing at it is a page only a crawler finds.
 * The unprefixed tree is never touched here. */
for (const locale of PUBLISHED) {
  const dir = path.join(root, locale);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

for (const { rel } of list) {
  const html = fs.readFileSync(path.join(root, rel), 'utf8');

  // The heading as the unprefixed page carries it. A locale whose translation
  // leaves it unchanged has nothing to derive a title from, and is left alone.
  const unprefixed = new JSDOM(html);
  const sourceH1 = textOf(unprefixed.window.document, 'h1');
  unprefixed.window.close();

  for (const locale of PUBLISHED) {
    let out;
    try {
      out = render(html, locale, rel, sourceH1);
    } catch (err) {
      problems.push(`${locale}/${rel}: ${err.message}`);
      continue;
    }

    // A document that still carries raw tokens has been generated wrong, and a
    // crawler sees the token rather than the sentence. Cheap to check here and
    // expensive to notice later.
    if (/\{\{(TESTCOUNT|VERSION)\}\}/.test(out.html)) {
      problems.push(`${locale}/${rel}: yerlestirilmemis {{TOKEN}} kaldi`);
      continue;
    }
    if (/<html lang="tr"/.test(out.html)) {
      problems.push(`${locale}/${rel}: lang tr kaldi`);
      continue;
    }

    const target = fileFor(locale, rel);
    fs.writeFileSync(target, out.html, 'utf8');
    written++;
    if (out.retitled) retitled++;
  }
}

/* The unprefixed pages get the same hreflang block, pointing at themselves for
 * Turkish and at the prefix for the rest. Without it the alternates are a
 * one-way claim: the localized pages would list the Turkish one, and the
 * Turkish one would list nothing.

 * They also get their structured data here, in Turkish, built from the Turkish
 * document -- the same code path as every other locale, so the homepage's
 * Organisation block and its questions are the Turkish ones rather than English
 * ones left over from before the locales existed. */
let annotated = 0;
for (const { rel } of list) {
  const file = path.join(root, rel);
  const html = fs.readFileSync(file, 'utf8');
  const dom = new JSDOM(html, { url: 'https://placeholder.invalid' + urlPath(rel) });
  const doc = dom.window.document;
  applyHead(doc, rel);
  structuredData.forPage(doc, {
    locale: SOURCE,
    source: SOURCE,
    pagePath: urlPath(rel),
    homePath: '/',
    dict: dicts[SOURCE],
    description: (doc.querySelector('meta[name="description"]') || {}).content || '',
  });
  const out = normalise(dom.serialize());
  if (out === html) continue;
  fs.writeFileSync(file, out, 'utf8');
  annotated++;
}

if (problems.length) {
  console.error('Locale uretimi basarisiz:');
  for (const p of problems) console.error(' -', p);
  process.exit(1);
}

console.log(`${list.length} sayfa · ${PUBLISHED.length} dil · ${written} dosya yazildi`);
console.log(`  isaretsiz (${SOURCE}): ${list.length} sayfa, ${annotated} tanim guncellendi`);
console.log(`  yazili: ${PUBLISHED.join(', ')}`);
console.log(`  yerel baslik/meta turetilen: ${retitled}`);
console.log(`  toplam: ${list.length * locales.eligible.length} adres`);