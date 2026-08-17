/**
 * Public Suffix List (PSL) based domain extraction utility.
 *
 * Replaces the naive `parts.slice(-2)` approach that fails on multi-part TLDs
 * like .co.uk, .com.tr, .org.au, .github.io etc.
 *
 * Security fix: Y1/Y2 — Prevents phishing domain bypass via incorrect eTLD+1.
 */

// Comprehensive multi-part public suffix list covering the most common ccTLDs
// and service-specific suffixes. This is a curated subset of Mozilla's PSL
// focused on suffixes that are actively exploited in phishing attacks.
const MULTI_PART_TLDS: ReadonlySet<string> = new Set([
  // United Kingdom
  'co.uk', 'org.uk', 'me.uk', 'net.uk', 'ltd.uk', 'plc.uk', 'sch.uk', 'ac.uk', 'gov.uk', 'nhs.uk',
  // Turkey
  'com.tr', 'org.tr', 'net.tr', 'gov.tr', 'edu.tr', 'mil.tr', 'bel.tr', 'k12.tr',
  // Australia
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'asn.au', 'id.au',
  // Brazil
  'com.br', 'org.br', 'net.br', 'gov.br', 'edu.br',
  // Japan
  'co.jp', 'or.jp', 'ne.jp', 'ac.jp', 'go.jp', 'ed.jp',
  // South Korea
  'co.kr', 'or.kr', 'ne.kr', 'go.kr', 're.kr',
  // India
  'co.in', 'org.in', 'net.in', 'gov.in', 'ac.in', 'edu.in',
  // China
  'com.cn', 'org.cn', 'net.cn', 'gov.cn', 'edu.cn',
  // Russia
  'com.ru', 'org.ru', 'net.ru',
  // South Africa
  'co.za', 'org.za', 'net.za', 'gov.za', 'ac.za',
  // New Zealand
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  // Hong Kong
  'com.hk', 'org.hk', 'net.hk', 'gov.hk', 'edu.hk',
  // Taiwan
  'com.tw', 'org.tw', 'net.tw', 'gov.tw', 'edu.tw',
  // Singapore
  'com.sg', 'org.sg', 'net.sg', 'gov.sg', 'edu.sg',
  // Indonesia
  'co.id', 'or.id', 'go.id', 'ac.id', 'web.id',
  // Thailand
  'co.th', 'or.th', 'ac.th', 'go.th', 'in.th',
  // Malaysia
  'com.my', 'org.my', 'net.my', 'gov.my', 'edu.my',
  // Philippines
  'com.ph', 'org.ph', 'net.ph', 'gov.ph', 'edu.ph',
  // Mexico
  'com.mx', 'org.mx', 'net.mx', 'gob.mx', 'edu.mx',
  // Argentina
  'com.ar', 'org.ar', 'net.ar', 'gov.ar', 'edu.ar',
  // Israel
  'co.il', 'org.il', 'net.il', 'ac.il', 'gov.il',
  // Pakistan
  'com.pk', 'org.pk', 'net.pk', 'gov.pk', 'edu.pk',
  // Egypt
  'com.eg', 'org.eg', 'net.eg', 'gov.eg', 'edu.eg',
  // Vietnam
  'com.vn', 'org.vn', 'net.vn', 'gov.vn', 'edu.vn',
  // Nigeria
  'com.ng', 'org.ng', 'net.ng', 'gov.ng', 'edu.ng',
  // Bangladesh
  'com.bd', 'org.bd', 'net.bd', 'gov.bd', 'edu.bd',
  // Ukraine
  'com.ua', 'org.ua', 'net.ua', 'gov.ua', 'edu.ua',
  // Greece
  'com.gr', 'org.gr', 'net.gr', 'gov.gr', 'edu.gr',
  // Poland
  'com.pl', 'org.pl', 'net.pl',
  // Portugal
  'com.pt', 'org.pt', 'net.pt', 'gov.pt',
  // Spain (rare but present)
  'com.es', 'org.es', 'nom.es',
  // Italy (rare but present)
  'co.it',
  // Service-specific and hosting suffixes commonly used in phishing
  'github.io', 'gitlab.io', 'herokuapp.com', 'vercel.app', 'netlify.app',
  'pages.dev', 'workers.dev', 'web.app', 'firebaseapp.com', 'appspot.com',
  'azurewebsites.net', 'cloudfront.net', 'amazonaws.com', 'blogspot.com',
  's3.amazonaws.com', 'storage.googleapis.com',
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
