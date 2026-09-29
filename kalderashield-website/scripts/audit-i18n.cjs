// Translation audit for the twelve locales.
//
//   node scripts/audit-i18n.cjs
//
// Exits non-zero on any finding, the same contract check-placeholders.cjs uses,
// so it can gate a commit.
//
// The checks that matter, in the order they have each caught something real:
//
//   1. cross-script contamination. A value for `ar` containing Cyrillic, a value
//      for `ja` containing Hangul. This is the one that finds silent corruption
//      -- six strings in the legal batch picked up text from the wrong language
//      mid-sentence and every key-parity check passed, because the key was
//      present and the value was a non-empty string.
//   2. markup-set drift. applyText switches to innerHTML only when the value
//      contains a tag, so a translation that drops the <strong> from a string
//      that had one does not break -- the emphasis just disappears, on one
//      language, with nothing in the console.
//   3. key parity, empty values, value-equals-key, keys the base does not have.
//   4. legal coverage, reported separately so a missing key in a privacy or
//      terms string is impossible to scroll past.
//
// An earlier version flagged "value identical to English" as an untranslated
// string. That produced fourteen findings, and every one was either a product
// name or a technical term that is correctly left in English. Reporting them
// taught nothing and would have trained people to ignore the output, so the
// check is gone; terminology uniformity is a judgement call and belongs in
// review, not in a gate that cries wolf.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const I18N_DIR = path.join(ROOT, 'assets', 'js', 'i18n');
const BASE = 'en';
const LEGAL_KEY_PREFIXES = ['privacy-', 'terms-'];

// Writing system each locale is expected to be in. A value may legitimately
// contain Latin (product names, URLs, HTML attribute values) so the check
// strips the tokens below before looking at what is left.
const SCRIPTS = {
  latin: /[\u0041-\u005A\u0061-\u007A\u00C0-\u024F]/,
  cyrillic: /[\u0400-\u04FF]/,
  arabic: /[\u0600-\u06FF\u0750-\u077F]/,
  han: /[\u4E00-\u9FFF]/,
  kana: /[\u3040-\u30FF]/,
  hangul: /[\uAC00-\uD7AF]/,
};
const EXPECTED_SCRIPTS = {
  en: ['latin'],
  tr: ['latin'],
  de: ['latin'],
  fr: ['latin'],
  es: ['latin'],
  it: ['latin'],
  pt: ['latin'],
  ru: ['cyrillic'],
  ar: ['arabic'],
  ja: ['kana', 'han'],
  ko: ['hangul'],
  zh: ['han'],
};

// Left in place verbatim in any locale: product, standard and API names.
const NEUTRAL_TOKENS = [
  'KalderaShield', 'Apache License 2.0', 'SHA-256', 'SHA3', 'Argon2id', 'Argon2',
  'AES-256-GCM', 'AES-GCM', 'OPFS', 'SQLite', 'wa-sqlite', 'WebAuthn', 'PRF',
  'Windows Hello', 'Touch ID', 'Passkey', 'passkey', 'Local-First', 'Air-Gap',
  'Zero-Knowledge', 'Sandbox', 'Cookie', 'cookie', 'GitHub', 'GitHub/Microsoft',
  'Microsoft', 'Releases', 'Linux', 'macOS', 'Windows', 'Android', 'iOS',
  'Tauri', 'Rust', 'npm', 'install.sh', 'admin@', '{{DOMAIN}}', '{{VERSION}}',
  'AES', 'GCM', 'SHA', 'E2EE', 'CLI', 'API', 'SDK', 'PRNG', 'HMAC', 'KDF',
  'OAuth', 'TOTP', 'YubiKey', 'DoH', 'DoT', 'HTTP', 'HTTPS', 'JSON', 'XML',
  'HTML', 'CSS', 'URL', 'URI', 'DNS', 'TLS', 'SSL', 'PWA', 'OR', 'AND',
];

// Any letter, in any script. Used to tell a translation from a placeholder.
const LETTER = /\p{L}/u;

/* Which writing systems a value uses, ignoring the parts that are legitimately
 * in another one.
 *
 * Not "strip the neutral parts, then run a regex over what's left". That is the
 * shape CodeQL reports as js/incomplete-multi-character-sanitization, and the
 * objection is fair even though this is a lint rather than a trust boundary: a
 * partial strip cannot be proven complete, and if a neutral token ever carried a
 * Cyrillic character the check would miss it. Walking the string instead means
 * no claim is made about what was removed, so the check is only ever as good as
 * the token list, which is the actual limitation and belongs in one place.
 */
function scriptsIn(value) {
  const found = new Set();
  const text = String(value);
  const lower = text.toLowerCase();
  let index = 0;

  const isNeutralAt = (position) => {
    for (const token of NEUTRAL_TOKENS) {
      if (lower.startsWith(token.toLowerCase(), position)) return token.length;
    }
    return 0;
  };

  while (index < text.length) {
    // Markup, URLs and host-like names: skip to the closing delimiter.
    if (text[index] === '<') {
      const close = text.indexOf('>', index);
      index = close === -1 ? text.length : close + 1;
      continue;
    }
    if (text.startsWith('http://', index) || text.startsWith('https://', index)) {
      let end = index;
      while (end < text.length && !/[\s"')]/.test(text[end])) end++;
      index = end;
      continue;
    }
    const neutral = isNeutralAt(index);
    if (neutral) {
      index += neutral;
      continue;
    }
    for (const [name, pattern] of Object.entries(SCRIPTS)) {
      if (pattern.test(text[index])) found.add(name);
    }
    index += 1;
  }

  return [...found];
}

function tagsIn(value) {
  const found = String(value).match(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi) || [];
  return found.map((tag) => tag.toLowerCase().replace(/\s.*$/, '')).sort();
}

function readLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(I18N_DIR, `${code}.json`), 'utf8'));
}

const base = readLocale(BASE);
const baseKeys = Object.keys(base);
const findings = [];

const codes = fs
  .readdirSync(I18N_DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''))
  .sort();

if (codes.length !== 12) {
  findings.push({ kind: 'locales', code: '-', detail: `expected 12, found ${codes.length}` });
}

for (const code of codes) {
  if (code === BASE) continue;
  const locale = readLocale(code);
  const expectedScripts = EXPECTED_SCRIPTS[code] || ['latin'];

  for (const key of baseKeys) {
    if (!Object.prototype.hasOwnProperty.call(locale, key)) {
      findings.push({ kind: 'missing', code, key });
      continue;
    }
    const value = locale[key];
    if (typeof value !== 'string' || value.trim() === '') {
      findings.push({ kind: 'empty', code, key });
      continue;
    }
    if (value === key) {
      findings.push({ kind: 'untranslated-key', code, key });
      continue;
    }

    // A value with no letters in it is a placeholder, not a translation.
    //
    // Five header strings were written through a shell pipeline that replaced
    // every code point outside Latin-1 with "?", so tr became "A??k" and ar, ru,
    // ja, ko and zh became runs of question marks. All of it passed: the keys
    // were present, the values were non-empty, and a run of "?" has no stray
    // writing system in it for the cross-script check to notice. A question mark
    // on its own is legitimate punctuation, which is why this asks for no
    // letters at all rather than for the absence of "?".
    if (!LETTER.test(value)) {
      findings.push({ kind: 'letterless', code, key, detail: JSON.stringify(value.slice(0, 30)) });
    }

    // Cross-script check, aimed at corruption rather than at Latin noise.
    //
    // Latin is never a finding: Arabic, Russian, Japanese, Korean and Chinese
    // strings legitimately carry Latin all the time -- file names, version
    // numbers, "Windows", "MB", product names. Flagging it produced over fifty
    // findings in ar.json alone, all of them correct.
    //
    // What is a finding is the other direction: a script that is neither
    // Latin nor the one the locale is written in. Cyrillic inside an Arabic
    // string, Hangul inside a Japanese one, Han inside a Russian one. That is
    // the signature of text pasted in from the wrong language, and it is what
    // caught three of the six corrupted legal strings.
    const nonLatin = scriptsIn(value).filter((name) => name !== 'latin');
    const stray = nonLatin.filter((name) => !expectedScripts.includes(name));
    if (stray.length) {
      findings.push({ kind: 'cross-script', code, key, detail: stray.join('+') });
    }

    // Leftover template syntax. A translation assembled from a template can
    // keep the placeholder in a shape the site never substitutes -- `_INTEGER`
    // in the Japanese privacy body was one -- and since it is still a non-empty
    // string, nothing else catches it.
    //
    // {{VERSION}} and {{DOMAIN}} are the site's two real placeholders and are
    // substituted at deploy time, so they are removed before looking. Any other
    // brace, dollar-brace, bare upper-case token, or a JS value that leaked
    // into a string is a finding.
    //
    // `null` is deliberately not in this list. It is the German and Dutch word
    // for zero, and de.json contains "null Cloud-Zwang" -- a real sentence about
    // not being forced into the cloud. Only identifiers that cannot be a word
    // in any of the twelve languages belong here.
    const withoutPlaceholders = value
      .split('{{VERSION}}')
      .join(' ')
      .split('{{DOMAIN}}')
      .join(' ');
    if (/\{|\}|\$\{|_[A-Z]{2,}|\bundefined\b|\bNaN\b/.test(withoutPlaceholders)) {
      findings.push({ kind: 'template-leftover', code, key, detail: value.slice(0, 50) });
    }

    const baseTags = tagsIn(base[key]);
    const localeTags = tagsIn(value);
    if (baseTags.join(',') !== localeTags.join(',')) {
      findings.push({
        kind: 'markup-drift',
        code,
        key,
        detail: `en=${baseTags.join(',') || '-'} here=${localeTags.join(',') || '-'}`,
      });
    }
  }

  for (const key of Object.keys(locale)) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      findings.push({ kind: 'extra', code, key });
    }
  }
}

// Legal coverage, called out on its own.
const legalKeys = baseKeys.filter((key) => LEGAL_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)));
for (const prefix of LEGAL_KEY_PREFIXES) {
  if (!legalKeys.some((key) => key.startsWith(prefix))) {
    findings.push({ kind: 'legal-none', code: BASE, detail: `no key starts with ${prefix}` });
  }
}
for (const code of codes) {
  const locale = readLocale(code);
  for (const key of legalKeys) {
    if (typeof locale[key] !== 'string' || locale[key].trim() === '') {
      findings.push({ kind: 'legal-missing', code, key });
    }
  }
}

// Every data-i18n a page references must exist in the base dictionary, and one
// key must not stand for two different sentences.
//
// The checks above compare dictionaries to each other and cannot see a page.
// `translate()` only assigns a value when the key is present, so a page naming a
// key that does not exist does not error -- it leaves the hardcoded fallback in
// place, in every language, silently. That is exactly how the privacy and terms
// bodies read as Turkish under a German header: the page shipped with a
// twelve-language selector and no data-i18n at all on the text that mattered.
//
// The conflict check is the other half. dl-desc was used for three sentences:
// the download page's hero line, and a GitHub Releases note on the home page
// that appeared twice. The dictionary value matched only the first, so
// translating put the hero copy where a note about digests and signatures
// belonged, in all twelve languages. Nothing in the JSON can show that -- one
// key, one valid value, two other meanings sitting in the markup.
const HTML_PAGES = ['index.html', 'download/index.html', 'privacy.html', 'terms.html', '404.html'];
const fallbackByKey = new Map();

for (const page of HTML_PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) {
    findings.push({ kind: 'page-missing', code: '-', key: page });
    continue;
  }
  const html = fs.readFileSync(file, 'utf8');
  const referenced = new Set();
  // Captures the element's own fallback text, for the conflict check. The
  // capture stops at the first closing tag, which is enough to tell two
  // sentences apart and is stable for a key used with the same markup twice.
  const fallbacks = html.matchAll(/\bdata-i18n="([^"]+)"[^>]*>([\s\S]{0,400}?)<\//g);
  for (const match of fallbacks) {
    const key = match[1].trim();
    if (!key) continue;
    const fallback = match[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    if (!fallback) continue;
    if (!fallbackByKey.has(key)) fallbackByKey.set(key, []);
    fallbackByKey.get(key).push({ page, fallback });
  }
  for (const match of html.matchAll(/\bdata-i18n(?:-attr)?\s*=\s*"([^"]*)"/g)) {
    // data-i18n-attr holds "attribute:key, attribute:key"
    const raw = match[1];
    if (raw.includes(':')) {
      for (const pair of raw.split(',')) {
        const name = (pair.split(':')[1] || '').trim();
        if (name) referenced.add(name);
      }
    } else if (raw.trim()) {
      referenced.add(raw.trim());
    }
  }
  for (const key of referenced) {
    if (!Object.prototype.hasOwnProperty.call(base, key)) {
      findings.push({ kind: 'dangling-ref', code: '-', key: `${page} -> ${key}` });
    }
  }
  // And the other direction, for the legal pages in particular: a key that
  // exists for them but that no page references is a translation nobody can
  // read, which is how the twenty body strings could have sat unused.
  if (page === 'privacy.html' || page === 'terms.html') {
    const prefix = page === 'privacy.html' ? 'privacy-' : 'terms-';
    for (const key of baseKeys.filter((k) => k.startsWith(prefix))) {
      if (!referenced.has(key)) {
        findings.push({ kind: 'orphan-key', code: '-', key: `${page} <- ${key}` });
      }
    }
  }
}

for (const [key, sites] of fallbackByKey) {
  const distinct = [...new Set(sites.map((site) => site.fallback))];
  if (distinct.length > 1) {
    findings.push({
      kind: 'key-conflict',
      code: '-',
      key,
      detail: distinct.map((text) => `${text.slice(0, 34)}`).join(' | '),
    });
  }
  void sites;
}

const byKind = {};
for (const finding of findings) byKind[finding.kind] = (byKind[finding.kind] || 0) + 1;

console.log(`locales ${codes.length}   keys ${baseKeys.length}   legal ${legalKeys.length}`);
console.log('legal prefixes: ' + LEGAL_KEY_PREFIXES.join(' '));

if (findings.length === 0) {
  console.log('Status: PASS');
  process.exit(0);
}

console.log('');
for (const finding of findings) {
  const where = finding.key ? `${finding.code} ${finding.key}` : finding.code;
  console.log(`  ${finding.kind.padEnd(18)} ${where}${finding.detail ? '  ' + finding.detail : ''}`);
}
console.log('');
console.log('By kind: ' + JSON.stringify(byKind));
console.log(`Status: FAIL - ${findings.length} finding(s).`);
process.exit(1);
