/* Quality gate for per-page search metadata.
 *
 * The generated and hand-written pages each carry their own <title> and meta
 * description. Three failure modes this catches, none of which break the page
 * visually:
 *
 *   1. A missing or empty <title> / description / canonical / Open Graph tag.
 *   2. Two pages sharing a title or description, which is how search engines
 *      decide neither page is the right result.
 *   3. A canonical that does not match the page's own published path, which
 *      quietly merges the page into whatever it points at.
 *
 * Length limits are the practical search-result ranges: titles past ~70
 * characters are truncated, descriptions past ~170 are cut off. Shorter is a
 * warning, not a failure -- a deliberately terse description is fine.
 *
 *   node scripts/audit-page-meta.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

/* The published surface: every index.html plus the two legal pages. */
function pageFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'assets' || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.name.endsWith('.html')) {
        // Every HTML file, not just the ones called index.html. Selecting by
        // filename left out the localized copies of privacy.html and terms.html
        // -- twenty-two pages with their own titles and descriptions, none of
        // them looked at.
        if (entry.name === '404.html') continue;
        out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

/* The canonical path a file must declare: index.html resolves to its folder,
 * so /urun/vault-history/index.html must claim /urun/vault-history/ and the
 * root index.html must claim /. A non-index page (privacy.html) claims its
 * own filename. */
function expectedCanonical(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.replace(/\/index\.html$/, '/');
  return '/' + rel;
}

function readTag(html, re) {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

const files = pageFiles();
const problems = [];
const titles = new Map();
const descriptions = new Map();

for (const file of files) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const html = fs.readFileSync(file, 'utf8');

  /* A page must not carry a commented-out copy of itself.
   *
   * The generated pages come from a template whose header comment documents its
   * placeholders as {{TOKEN}}. Substituting every {{TOKEN}} in the file also
   * rewrote that documentation, so the comment filled with real page markup and
   * pushed the closing delimiter down to line 75 -- leaving each generated page
   * carrying roughly six kilobytes of its own stale body, downloaded by every
   * visitor and every crawler. It rendered perfectly, which is why it survived:
   * a comment is invisible.
   *
   * build-pages.cjs no longer substitutes inside the comment. Asserting it here
   * covers all 276 pages instead of only the nineteen that generator writes.
   *
   * Every comment is examined, not just the first one. Checking only the first
   * meant a stray commented-out block further down the file passed, which is
   * exactly what happened the first time this check was written. */
  const MARKUP_IN_COMMENT = /<(?:details|section|article|div|p|h[1-6])\b|data-i18n=/;
  let dead = 0;
  for (const comment of html.match(/<!--[\s\S]*?-->/g) || []) {
    if (!MARKUP_IN_COMMENT.test(comment)) continue;
    dead += comment.length;
  }
  if (dead) {
    problems.push(`${rel}: yorum icinde sayfa icerigi var (${dead} karakter olu kod)`);
  }

  const title = readTag(html, /<title>([^<]*)<\/title>/);
  const description = readTag(html, /<meta\s+name="description"\s+content="([^"]*)"/);
  const canonical = readTag(html, /<link\s+rel="canonical"\s+href="([^"]*)"/);
  const ogTitle = readTag(html, /<meta\s+property="og:title"\s+content="([^"]*)"/);
  const ogDesc = readTag(html, /<meta\s+property="og:description"\s+content="([^"]*)"/);
  const ogImage = readTag(html, /<meta\s+property="og:image"\s+content="([^"]*)"/);
  const lang = readTag(html, /<html[^>]*\slang="([^"]*)"/);

  if (!title) problems.push(`${rel}: <title> yok`);
  else if (title.length > 70) problems.push(`${rel}: title ${title.length} karakter (>70, arama sonucunda kesilir)`);
  if (title) titles.set((titles.get(title) || []).concat(rel) && title, [...(titles.get(title) || []), rel]);

  if (description === null) problems.push(`${rel}: meta description yok`);
  else if (description.length > 170) problems.push(`${rel}: description ${description.length} karakter (>170)`);
  if (description) descriptions.set(description, [...(descriptions.get(description) || []), rel]);

  if (!canonical) problems.push(`${rel}: canonical yok`);
  else if (!canonical.startsWith('https://{{DOMAIN}}' + expectedCanonical(file))) {
    problems.push(`${rel}: canonical "${canonical}" beklenen yol "${expectedCanonical(file)}" degil`);
  }

  if (!ogTitle) problems.push(`${rel}: og:title yok`);
  if (!ogDesc) problems.push(`${rel}: og:description yok`);
  if (!ogImage) problems.push(`${rel}: og:image yok`);

  if (!lang) problems.push(`${rel}: html lang yok`);
}

for (const [title, where] of titles) {
  if (where.length > 1) problems.push(`ayni title ${where.length} sayfada: "${title}" -> ${where.join(', ')}`);
}
for (const [description, where] of descriptions) {
  if (where.length > 1) problems.push(`ayni description ${where.length} sayfada -> ${where.join(', ')}`);
}

if (problems.length) {
  console.log(`${problems.length} meta sorunu:`);
  for (const p of problems) console.log('  ' + p);
  process.exit(1);
}
console.log(`meta temiz (${files.length} sayfa).`);
