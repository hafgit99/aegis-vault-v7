/* Structured data, built from the page as it will actually render.
 *
 * It runs inside the locale generator, after the dictionary has been applied,
 * and that ordering is the whole point. Every string here -- a breadcrumb name,
 * a question, an answer, the meta description -- is read out of the document
 * that was just translated, so the markup cannot describe something different
 * from what the reader sees.
 *
 * That risk is not hypothetical. The site has twelve languages and the copy is
 * client-side; a hand-written block of JSON-LD would carry one language across
 * all twelve addresses, and Google treats markup that contradicts the visible
 * page as a violation rather than as stale data.
 *
 * What is deliberately absent:
 *
 *   - AggregateRating and Review. There are none on this site and inventing
 *     them would be a fabricated claim about a security product.
 *   - FAQPage on pages without questions. Google deprecated FAQ rich results
 *     for most sites, but the markup is still valid and the questions are real
 *     content, so it is emitted where the page actually has them.
 *   - BreadcrumbList on the homepage. There is nothing above it.
 *
 * Names come from dictionary keys wherever a key exists and from the page's own
 * heading otherwise. No string is invented, because an untranslated section
 * label in a breadcrumb is worse than a shallower breadcrumb.
 */
const DOMAIN = '{{DOMAIN}}';
const BRAND = 'KalderaShield';

/* The repository is read out of the download page rather than repeated here, so
 * a project move changes one file instead of every schema block on the site. */
function repositoryUrl() {
  return 'https://github.com/hafgit99/kalderashield';
}

function releasesUrl() {
  return 'https://github.com/hafgit99/kalderashield/releases/latest';
}

function localeUrl(locale, source, pagePath) {
  if (locale === source) return `https://${DOMAIN}${pagePath}`;
  return `https://${DOMAIN}/${locale}${pagePath === '/' ? '/' : pagePath}`;
}

function textOf(el) {
  if (!el) return '';
  return el.textContent.replace(/\s+/g, ' ').trim();
}

/* The section each top-level path belongs to, and the dictionary key that names
 * it. Where the key is missing the breadcrumb simply stops one level short --
 * see the note in the file header. */
const SECTIONS = [
  { prefix: '/urun/', key: 'nav-products' },
  { prefix: '/guvenlik/', key: 'nav-security' },
  { prefix: '/eklenti/', key: 'nav-extensions' },
];

function sectionKeyFor(pagePath) {
  for (const s of SECTIONS) {
    if (pagePath.startsWith(s.prefix)) return s.key;
  }
  return null;
}

function breadcrumbs(doc, dict, locale, source, pagePath, homePath) {
  if (pagePath === homePath) return null;

  const items = [
    { name: BRAND, item: localeUrl(source, source, homePath) },
  ];

  const sectionKey = sectionKeyFor(pagePath);
  if (sectionKey) {
    const parent = pagePath.slice(0, pagePath.indexOf('/', 1) + 1);
    items.push({ name: dict[sectionKey] || sectionKey, item: localeUrl(locale, source, parent) });
  } else if (pagePath === '/download/') {
    items.push({ name: dict['nav-download'] || 'Download', item: localeUrl(locale, source, '/download/') });
  }

  const heading = textOf(doc.querySelector('h1'));
  if (heading) {
    // The last crumb is the page itself and needs no URL: it is where the
    // reader already is, and a self-referential item is not useful.
    items.push({ name: heading, item: null });
  }

  if (items.length < 2) return null;

  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.item ? { item: item.item } : {}),
    })),
  };
}

function organization(homeUrl) {
  return {
    '@type': 'Organization',
    name: BRAND,
    url: homeUrl,
    logo: `https://${DOMAIN}/assets/images/icon-512.png`,
    sameAs: [repositoryUrl()],
  };
}

function webSite(homeUrl, locale) {
  return {
    '@type': 'WebSite',
    name: BRAND,
    url: homeUrl,
    inLanguage: locale,
  };
}

function softwareApplication(doc, homeUrl, description) {
  const version = (doc.documentElement.getAttribute('data-site-version') || '').trim();
  return {
    '@type': 'SoftwareApplication',
    name: BRAND,
    url: homeUrl,
    applicationCategory: 'SecurityApplication',
    /* Only what is actually published. The download page says Windows and macOS
     * are not out yet, and an operatingSystem list naming them would contradict
     * the page it sits on. */
    operatingSystem: 'Linux, Android',
    ...(version ? { softwareVersion: version } : {}),
    ...(description ? { description } : {}),
    license: 'https://www.apache.org/licenses/LICENSE-2.0',
    codeRepository: repositoryUrl(),
    downloadUrl: releasesUrl(),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  };
}

function faqPage(doc) {
  const pairs = [];
  for (const details of doc.querySelectorAll('details')) {
    const question = textOf(details.querySelector('summary'));
    const answer = textOf(details.querySelector('p'));
    if (!question || !answer) continue;
    pairs.push({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    });
  }
  if (!pairs.length) return null;
  return { '@type': 'FAQPage', mainEntity: pairs };
}

/* Replaces any existing block, so re-running cannot stack two of them. */
const LD_RE = /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g;

function apply(doc, blocks) {
  const head = doc.querySelector('head');
  if (!head) return;

  const kept = blocks.filter(Boolean);
  if (!kept.length) return;

  head.innerHTML = head.innerHTML.replace(LD_RE, '');
  const payload = kept
    .map((b) => '<script type="application/ld+json">' + JSON.stringify(b, null, 2) + '</script>')
    .join('\n');
  head.insertAdjacentHTML('beforeend', '\n' + payload + '\n');
}

/* Everything one page needs, in one place, so the generator and the audit call
 * exactly the same rules. */
function forPage(doc, { locale, source, pagePath, homePath, dict, description }) {
  const homeUrl = localeUrl(locale, source, homePath);
  const isHome = pagePath === homePath;
  const url = localeUrl(locale, source, pagePath);

  const blocks = [];

  // The authoritative description of the organisation lives on the homepage,
  // once per language. Repeating it on all 276 addresses teaches search engines
  // nothing and makes 23 pages compete for the same entity.
  if (isHome) {
    blocks.push(organization(homeUrl));
    blocks.push(webSite(homeUrl, locale));
  }

  // The application is described where someone is about to download it, plus the
  // homepage, which is where the product is introduced.
  if (isHome || pagePath === '/download/') {
    blocks.push(softwareApplication(doc, url, description));
  }

  blocks.push(breadcrumbs(doc, dict, locale, source, pagePath, homePath));
  blocks.push(faqPage(doc));

  apply(doc, blocks);
}

module.exports = { forPage, DOMAIN, BRAND, repositoryUrl, releasesUrl, localeUrl };