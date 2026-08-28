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
/**
 * Public Suffix List (PSL) based domain extraction utility (M6).
 *
 * Implements the standard Mozilla PSL matching algorithm over the full baked
 * list (src-extension/psl-data.generated.ts — 10k+ rules) instead of a curated
 * subset: wildcard rules (`*.ck`), exception rules (`!www.ck`) and the
 * default rule all behave per https://publicsuffix.org/list/ specification.
 */

import { PSL_ICANN_RULES, PSL_PRIVATE_RULES } from './psl-data.generated';

const ALL_RULES: readonly string[] = [...PSL_ICANN_RULES, ...PSL_PRIVATE_RULES];

const ruleSet = new Set<string>(ALL_RULES);
const exceptionSet = new Set<string>(
  ALL_RULES.filter((rule) => rule.startsWith('!')).map((rule) => rule.slice(1)),
);
let maxRuleLabels = 1;
for (const rule of ALL_RULES) {
  maxRuleLabels = Math.max(maxRuleLabels, rule.split('.').length);
}

/**
 * P2-17 / R-2: Well-known internationalized TLDs with strict registrar anti-homograph protections.
 */
export const SAFE_IDN_TLDS: ReadonlySet<string> = new Set([
  '.de', '.jp', '.cn', '.kr', '.ru', '.br', '.pl', '.fr', '.es', '.nl',
  '.se', '.no', '.fi', '.dk', '.at', '.ch', '.it', '.pt', '.tr', '.ua',
  '.cz', '.hu', '.ro', '.bg', '.hr', '.sk', '.si',
]);

/**
 * Checks whether an IDN punycode hostname (`xn--...`) should be flagged as suspicious.
 * Exempts reputable ccTLDs that enforce registry-level script restrictions.
 */
export function isSuspiciousIdnHostname(hostname: string): boolean {
  if (!hostname.includes('xn--')) {
    return false;
  }
  const tld = '.' + (hostname.split('.').pop() || '').toLowerCase();
  return !SAFE_IDN_TLDS.has(tld);
}

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
/**
 * Number of labels that make up the public suffix of a hostname, per the PSL
 * algorithm: exception rules win first, then the longest matching rule
 * (exact or `*` wildcard on the leftmost label), default rule is `*`.
 */
function publicSuffixLabelCount(labels: string[]): number {
  const max = Math.min(labels.length, maxRuleLabels);

  // Exception rules prevail over any matching normal rule.
  for (let k = max; k >= 1; k--) {
    if (exceptionSet.has(labels.slice(labels.length - k).join('.'))) {
      return k - 1;
    }
  }

  for (let k = max; k >= 1; k--) {
    const candidate = labels.slice(labels.length - k).join('.');
    if (ruleSet.has(candidate)) {
      return k;
    }
    // Wildcard rules only ever use `*` as their leftmost label.
    if (k >= 2 && ruleSet.has(['*', ...labels.slice(labels.length - k + 1)].join('.'))) {
      return k;
    }
  }

  return 1; // default rule `*`
}

/**
 * Extracts the registrable domain (eTLD+1) from a hostname using PSL lookup.
 *
 * Examples:
 *   login.facebook.co.uk → facebook.co.uk  (multi-part TLD: co.uk)
 *   www.example.com      → example.com     (simple TLD: com)
 *   sub.deep.example.org → example.org     (simple TLD: org)
 *   my-app.github.io     → my-app.github.io (private suffix: github.io)
 *   www.www.ck           → www.ck          (exception rule: !www.ck)
 *   foo.bar.ck           → foo.bar.ck      (wildcard rule: *.ck)
 *
 * @param hostname - Raw hostname (may include www. prefix)
 * @returns The registrable domain (eTLD+1)
 */
export function extractRegistrableDomain(hostname: string): string {
  // No manual `www.` stripping: the PSL algorithm already treats www as an
  // ordinary subdomain, and stripping it breaks exception rules like !www.ck.
  const clean = hostname.toLowerCase().replace(/\.+$/, '');
  if (!clean) {
    return '';
  }
  const labels = clean.split('.');
  if (labels.length === 1) {
    return clean; // e.g. "localhost"
  }
  const suffixLen = publicSuffixLabelCount(labels);
  if (labels.length <= suffixLen) {
    // Host is itself a public suffix — nothing registrable beyond it.
    return clean;
  }
  return labels.slice(labels.length - suffixLen - 1).join('.');
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
