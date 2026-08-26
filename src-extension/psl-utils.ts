/**
 * Public Suffix List (PSL) based domain extraction utility.
 *
 * Replaces the naive `parts.slice(-2)` approach that fails on multi-part TLDs
 * like .co.uk, .com.tr, .org.au, .github.io etc.
 *
 * Security fix: Y1/Y2/M-9 — Comprehensive curated Public Suffix List covering
 * all major multi-part country-code TLDs, second-level registries, and cloud hosting domains.
 */

// Comprehensive multi-part public suffix list covering the most common ccTLDs
// and service-specific suffixes. This is a curated subset of Mozilla's PSL
// focused on suffixes that are actively exploited in phishing attacks.
const MULTI_PART_TLDS: ReadonlySet<string> = new Set([
  // United Kingdom
  'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk', 'sch.uk', 'ac.uk', 'gov.uk', 'nhs.uk',
  // Turkey
  'com.tr', 'org.tr', 'net.tr', 'gov.tr', 'edu.tr', 'mil.tr', 'bel.tr', 'k12.tr', 'av.tr', 'dr.tr', 'biz.tr', 'info.tr', 'tv.tr', 'gen.tr', 'name.tr',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au', 'csiro.au',
  // Brazil
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br', 'ind.br', 'inf.br', 'tur.br', 'b.br',
  // Japan
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp', 'ed.jp', 'gr.jp', 'lg.jp', 'ad.jp',
  // South Korea
  'co.kr', 'or.kr', 'ne.kr', 'go.kr', 're.kr', 'pe.kr', 'ac.kr',
  // India
  'co.in', 'org.in', 'net.in', 'gov.in', 'ac.in', 'edu.in', 'gen.in', 'firm.in', 'ind.in', 'nic.in', 'res.in',
  // China
  'com.cn', 'org.cn', 'net.cn', 'gov.cn', 'edu.cn', 'ac.cn',
  // Russia
  'com.ru', 'org.ru', 'net.ru', 'pp.ru',
  // South Africa
  'co.za', 'org.za', 'net.za', 'gov.za', 'ac.za', 'edu.za',
  // New Zealand
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz', 'school.nz', 'iwi.nz',
  // Hong Kong
  'com.hk', 'org.hk', 'net.hk', 'gov.hk', 'edu.hk', 'idv.hk',
  // Taiwan
  'com.tw', 'org.tw', 'net.tw', 'gov.tw', 'edu.tw', 'idv.tw',
  // Singapore
  'com.sg', 'org.sg', 'net.sg', 'gov.sg', 'edu.sg', 'per.sg',
  // Indonesia
  'co.id', 'or.id', 'go.id', 'ac.id', 'web.id', 'sch.id', 'net.id',
  // Thailand
  'co.th', 'or.th', 'ac.th', 'go.th', 'in.th', 'mi.th', 'net.th',
  // Malaysia
  'com.my', 'org.my', 'net.my', 'gov.my', 'edu.my', 'mil.my', 'name.my',
  // Philippines
  'com.ph', 'org.ph', 'net.ph', 'gov.ph', 'edu.ph', 'ngo.ph',
  // Mexico
  'com.mx', 'org.mx', 'net.mx', 'gob.mx', 'edu.mx',
  // Argentina
  'com.ar', 'org.ar', 'net.ar', 'gov.ar', 'edu.ar', 'int.ar', 'mil.ar', 'tur.ar',
  // Israel
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il', 'k12.il', 'muni.il',
  // Pakistan
  'com.pk', 'org.pk', 'net.pk', 'gov.pk', 'edu.pk', 'gop.pk',
  // Egypt
  'com.eg', 'org.eg', 'net.eg', 'gov.eg', 'edu.eg', 'sci.eg',
  // Vietnam
  'com.vn', 'org.vn', 'net.vn', 'gov.vn', 'edu.vn', 'ac.vn', 'biz.vn', 'info.vn',
  // Nigeria
  'com.ng', 'org.ng', 'net.ng', 'gov.ng', 'edu.ng', 'sch.ng', 'name.ng',
  // Bangladesh
  'com.bd', 'org.bd', 'net.bd', 'gov.bd', 'edu.bd', 'ac.bd',
  // Ukraine
  'com.ua', 'org.ua', 'net.ua', 'gov.ua', 'edu.ua', 'in.ua',
  // Greece
  'com.gr', 'org.gr', 'net.gr', 'gov.gr', 'edu.gr',
  // Poland
  'com.pl', 'org.pl', 'net.pl', 'biz.pl', 'info.pl', 'edu.pl', 'gov.pl',
  // Portugal
  'com.pt', 'org.pt', 'net.pt', 'gov.pt', 'edu.pt',
  // Spain
  'com.es', 'org.es', 'nom.es', 'gob.es', 'edu.es',
  // Italy
  'co.it', 'gov.it', 'edu.it',
  // Germany / Austria / Switzerland
  'com.de', 'co.at', 'or.at', 'gv.at', 'ac.at', 'co.ch',
  // Canada
  'com.ca', 'co.ca', 'ab.ca', 'bc.ca', 'mb.ca', 'nb.ca', 'nl.ca', 'ns.ca', 'nt.ca', 'nu.ca', 'on.ca', 'pe.ca', 'qc.ca', 'sk.ca', 'yk.ca',
  // Colombia, Peru, Chile, Venezuela, Ecuador
  'com.co', 'net.co', 'nom.co', 'org.co', 'gov.co', 'edu.co',
  'com.pe', 'org.pe', 'net.pe', 'gob.pe', 'edu.pe',
  'co.cl', 'gob.cl', 'gov.cl',
  'com.ve', 'org.ve', 'net.ve', 'gob.ve', 'edu.ve',
  'com.ec', 'org.ec', 'net.ec', 'gob.ec', 'edu.ec',
  // Middle East & Africa (P1-7c addition)
  'com.sa', 'net.sa', 'org.sa', 'gov.sa', 'edu.sa', 'med.sa',
  'com.ae', 'net.ae', 'org.ae', 'gov.ae', 'ac.ae', 'sch.ae',
  'com.kw', 'net.kw', 'org.kw', 'gov.kw', 'edu.kw',
  'com.qa', 'net.qa', 'org.qa', 'gov.qa', 'edu.qa',
  'com.bh', 'net.bh', 'org.bh', 'gov.bh', 'edu.bh',
  'com.om', 'net.om', 'org.om', 'gov.om', 'edu.om',
  'com.jo', 'net.jo', 'org.jo', 'gov.jo', 'edu.jo',
  'com.lb', 'net.lb', 'org.lb', 'gov.lb', 'edu.lb',
  'co.ke', 'or.ke', 'ne.ke', 'go.ke', 'ac.ke', 'sc.ke',
  'co.ug', 'or.ug', 'ne.ug', 'go.ug', 'ac.ug', 'sc.ug',
  'co.tz', 'or.tz', 'ne.tz', 'go.tz', 'ac.tz', 'sc.tz',
  'com.gh', 'org.gh', 'net.gh', 'gov.gh', 'edu.gh',
  'com.tn', 'org.tn', 'net.tn', 'gov.tn', 'edunet.tn',
  'com.ma', 'org.ma', 'net.ma', 'gov.ma', 'ac.ma',
  'com.dz', 'org.dz', 'net.dz', 'gov.dz', 'edu.dz',
  'com.sn', 'org.sn', 'net.sn', 'gov.sn', 'univ.sn',
  // Nordic / Benelux
  'com.nl', 'co.nl', 'net.nl',
  'co.no', 'org.no', 'priv.no',
  'com.se', 'org.se', 'tm.se',
  'com.fi', 'co.fi',
  'com.dk', 'co.dk',
  // Service-specific and hosting suffixes commonly used in phishing
  'github.io', 'gitlab.io', 'herokuapp.com', 'vercel.app', 'netlify.app',
  'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'appspot.com',
  'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'blogspot.com',
  's3.amazonaws.com', 'storage.googleapis.com', 'cloudapp.net', 'fly.dev', 'render.com',
]);

/**
 * Extracts the registrable domain (eTLD+1) from a hostname using PSL lookup.
 *
 * Examples:
 *   login.facebook.co.uk → facebook.co.uk  (multi-part TLD: co.uk)
 *   www.example.com      → example.com     (simple TLD: com)
 *   sub.deep.example.org → example.org     (simple TLD: org)
 *   my-app.github.io     → my-app.github.io (service suffix: github.io)
 *   login.facebo0k.co.uk → facebo0k.co.uk  (correctly preserves registrable domain for phishing check)
 *
 * @param hostname - Raw hostname (may include www. prefix)
 * @returns The registrable domain (eTLD+1)
 */
export function extractRegistrableDomain(hostname: string): string {
  const clean = hostname.replace(/^www\./, '').toLowerCase();
  const parts = clean.split('.');

  if (parts.length <= 2) {
    return clean;
  }

  // Check for multi-part TLD matches (longest match first)
  // Try 3-part suffix first (e.g., s3.amazonaws.com), then 2-part (e.g., co.uk)
  if (parts.length >= 4) {
    const threePartSuffix = parts.slice(-3).join('.');
    if (MULTI_PART_TLDS.has(threePartSuffix)) {
      // eTLD+1 is the 4th part from the end + the 3-part suffix
      return parts.slice(-4).join('.');
    }
  }

  const twoPartSuffix = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(twoPartSuffix)) {
    // eTLD+1 is the 3rd part from the end + the 2-part suffix
    return parts.slice(-3).join('.');
  }

  // Default: standard single-part TLD (e.g., .com, .org, .net)
  return parts.slice(-2).join('.');
}

/**
 * Checks whether two URLs share the same registrable domain (eTLD+1).
 *
 * @param url1 - First URL string
 * @param url2 - Second URL string
 * @returns true if both URLs have the same registrable domain
 */
export function isSameRegistrableDomain(url1: string, url2: string): boolean {
  try {
    const host1 = new URL(url1).hostname;
    const host2 = new URL(url2).hostname;
    return extractRegistrableDomain(host1) === extractRegistrableDomain(host2);
  } catch {
    return false;
  }
}

/**
 * Extracts the registrable domain from a full URL string.
 *
 * @param url - Full URL string (e.g., https://login.example.co.uk/path)
 * @returns The registrable domain or empty string if URL is invalid
 */
export function extractRegistrableDomainFromUrl(url: string): string {
  try {
    return extractRegistrableDomain(new URL(url).hostname);
  } catch {
    return '';
  }
}
