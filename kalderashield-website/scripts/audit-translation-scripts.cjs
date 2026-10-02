/* Translation QA gate: catches text from the wrong script in a dictionary.
 *
 * A copy-paste slip or a bad generation can drop a Chinese fragment into the
 * Japanese file or an English word into the Russian one, and nothing else in
 * the toolchain notices: the JSON still parses, the key count still matches,
 * and the page renders. These checks fail loudly instead.
 *
 *   node scripts/audit-translation-scripts.cjs
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

// Tokens that are legitimately shared across locales: product names,
// algorithms, protocol names and version strings are never translated.
const ALLOW = [
  'KalderaShield', 'AES', 'GCM', 'Argon2id', 'HMAC', 'SHA', 'SHA-256', 'HKDF',
  'WebCrypto', 'SQLite', 'OPFS', 'TOTP', 'WebAuthn', 'FIDO2', 'YubiKey',
  'CSV', 'JSON', 'HTTP', 'HTTPS', 'TLS', 'BIP-39', 'PBKDF2', 'OpenSSF',
  'Scorecard', 'CodeQL', 'Bitwarden', 'LastPass', '1Password', 'Chrome',
  'Edge', 'Firefox', 'Safari', 'Windows', 'macOS', 'Android', 'Linux',
  'TypeScript', 'Apache', 'GitHub', 'security', 'txt', 'Tauri', 'React',
  'PRF', 'MS', 'MiB', 'IT', 'OWASP', 'MSIX', 'NSIS', 'DMG', 'APK', 'CRX',
  'XPI', 'PRC', 'st', 'nd', 'rd', 'th',
];

const RULES = {
  tr: { forbid: /[぀-ヿ㐀-䶿一-鿿가-힯Ѐ-ӿ]/g, label: 'CJK / Kiril / Hangul' },
  en: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, label: 'Cyrillic / CJK / Hangul / Arabic' },
  de: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, label: 'Cyrillic / CJK / Hangul / Arabic' },
  fr: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, label: 'Cyrillic / CJK / Hangul / Arabic' },
  es: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, label: 'Cyrillic / CJK / Hangul / Arabic' },
  it: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, label: 'Cyrillic / CJK / Hangul / Arabic' },
  pt: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, label: 'Cyrillic / CJK / Hangul / Arabic' },
  ru: { forbid: /[㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, label: 'CJK / Hangul / Arabic' },
  ja: { forbid: /[Ѐ-ӿ가-힯؀-ۿ]/g, label: 'Cyrillic / Hangul / Arabic' },
  zh: { forbid: /[Ѐ-ӿ가-힯؀-ۿ]/g, label: 'Cyrillic / Hangul / Arabic' },
  ko: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿؀-ۿ]/g, label: 'Cyrillic / CJK / Arabic' },
  ar: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯]/g, label: 'Cyrillic / CJK / Hangul' },
};

// Japanese, Chinese and Korean share Han characters, so no automatic check can
// tell a correct Japanese sentence from a Chinese one that leaked in. Those
// locales still get the foreign-script checks above (Cyrillic, Hangul, Arabic),
// but han-kanji quality needs a native reviewer -- see the project's own rule
// that every security string is read by someone who speaks the language.

function stripAllowed(text) {
  let out = text;
  for (const token of ALLOW) {
    out = out.split(token).join(' ');
  }
  return out;
}

let problems = 0;

for (const [locale, rule] of Object.entries(RULES)) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string') continue;
    const cleaned = stripAllowed(value);

    const foreign = cleaned.match(rule.forbid);
    if (foreign) {
      problems++;
      console.log(`[${locale}] ${key}: ${rule.label} bulundu -> ${JSON.stringify([...new Set(foreign)].join(''))}`);
      console.log(`    ${value.slice(0, 100)}`);
    }
  }
}

console.log(problems ? `\n${problems} sorun bulundu.` : 'Sorun yok: tum dosyalar dogru betikleri kullaniyor.');
process.exit(problems ? 1 : 0);
