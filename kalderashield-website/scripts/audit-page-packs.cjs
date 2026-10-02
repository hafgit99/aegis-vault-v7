/* Quality gate for the product-page translation packs in i18n-pages/.
 *
 * Separate from audit-packs.cjs on purpose: that script covers the homepage
 * packs, and rewriting it while translators are running it would change the
 * result underneath them.
 *
 * Three failure modes this catches, all of which parse as valid JSON and keep
 * the key count correct:
 *
 *   1. A value still byte-identical to English - never translated. Product
 *      names are allowed through a whitelist; prose is not.
 *   2. A stray Latin word inside a non-Latin sentence ("サーバーの運営antisquat継続").
 *      Latin script is the writing system for de/fr/es/it/pt, so the run-length
 *      check is scoped to the locales where it would actually be an error.
 *   3. A key present in English but absent from the pack, which would merge as
 *      a silent gap rather than a visible one.
 *
 *   node scripts/audit-page-packs.cjs [locale...]
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const PACKS = path.join(root, 'i18n-pages');
const I18N = path.join(root, 'assets', 'js', 'i18n');

const ALL = ['de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'ar'];
const NON_LATIN = new Set(['ru', 'ja', 'zh', 'ko', 'ar']);

const OK_TERMS = [
  'KalderaShield', 'AES-256-GCM', 'AES', 'GCM', 'Argon2id', 'HMAC', 'SHA-256',
  'SHA256', 'HKDF-SHA256', 'WebCrypto', 'SQLite', 'OPFS', 'TOTP', 'WebAuthn',
  'FIDO2', 'YubiKey', 'PBKDF2', 'BIP-39', 'OpenSSF', 'Scorecard', 'CodeQL',
  'Bitwarden', 'LastPass', '1Password', 'Chrome', 'Edge', 'Firefox', 'Safari',
  'Windows', 'macOS', 'Android', 'Linux', 'TypeScript', 'Apache', 'GitHub',
  'HIBP', 'eTLD+1', 'Public Suffix List', 'CSPRNG', 'TPM 2.0', 'TPM',
  'Secure Enclave', 'AndroidKeyStore', 'Diceware', 'MiB', 'KDF', 'CVV', 'PIN',
  '2FA', 'CSV', 'JSON', 'HTTP', 'Have I Been Pwned', 'Windows Hello',
  'Touch ID', 'Face ID', 'WebDAV', 'S3', 'API', 'ID', 'URL', 'OAuth',
  'Passkey', 'Passkeys',
  // Security/platform/FAQ page vocabulary (Faz 3-4). These are proper nouns,
  // tool names or code literals that stay in Latin script in every locale;
  // fragments of hyphenated or underscored identifiers appear here because
  // the run-length check splits on those characters.
  'Tauri', 'Rust', 'React', 'cargo', 'npm', 'Stryker', 'fast-check', 'fast',
  'check', 'gitleaks', 'minisign', 'cosign', 'Sigstore', 'OIDC', 'CSP',
  'XPI', 'AMO', 'MSI', 'NSIS', 'AppImage', 'dpkg', 'Debian', 'Ubuntu',
  'Mint', 'GTK3', 'WebKitGTK', 'Chromium', 'Mozilla', 'PowerShell',
  'Authenticode', 'SmartScreen', 'Gatekeeper', 'Rosetta', 'Developer ID',
  'Developer', 'Apple Silicon', 'Apple', 'Intel', 'Pixel', 'Samsung',
  'Xiaomi', 'wa-sqlite', 'sqlite', 'sessionStorage', 'localStorage',
  'storage', 'nativeMessaging', 'activeTab', 'BiometricPrompt',
  'CryptoObject', 'Android Credential Provider', 'Credential', 'Provider',
  'setUserAuthenticationRequired', 'Manifest V3', 'Manifest', 'XChaCha20-Poly1305',
  'XChaCha20', 'Poly1305', 'WDA_EXCLUDEFROMCAPTURE', 'EXCLUDEFROMCAPTURE',
  'FLAG_SECURE', 'FLAG', 'SECURE', 'SHA256SUMS.txt', 'SUMS', 'latest.json',
  'latest', 'Get-FileHash', 'FileHash', 'sha256sum', 'shasum', 'setup.exe',
  'setup', 'Setup', 'chmod', 'script-src', 'script', 'self',
  'data_collection_permissions', 'data', 'collection', 'fetch', 'WebSocket',
  'WebRTC', 'XHR', 'sendBeacon', 'EventSource', 'GitHub Actions', 'Actions',
  'json', 'WebView', 'HTML', 'Release', 'Beta', 'THIRD-PARTY', 'THIRD',
  'PARTY', 'SECURITY.md', 'SECURITY', 'release-local', 'local', 'platform',
  'none',
  // Lowercase forms: these are established loanwords written lowercase in
  // Russian and Chinese technical copy, so they are not untranslated text.
  'passkey', 'passkeys', 'pwned',
];

/* Longest term first. Splitting "Passkeys" by the shorter "Passkey" would
 * leave a stray "s" behind and make a correctly untranslated product name look
 * like an untranslated sentence. */
const OK_SORTED = OK_TERMS.slice().sort((a, b) => b.length - a.length);

function stripTerms(text) {
  let s = text;
  for (const t of OK_SORTED) s = s.split(t).join(' ');
  return s;
}

/* A value whose English source is nothing but product names is
 * language-neutral by nature: "Windows Hello", "macOS" and "Passkeys" are the
 * same words in every locale. Flagging those as "never translated" would be
 * noise, and noise is what makes a gate get ignored. */
function isLanguageNeutral(value) {
  const s = ' ' + value.replace(/[^\w\s.+-]/g, ' ') + ' ';
  return !/\S/.test(stripTerms(s));
}

const LONG_LATIN = /[A-Za-z][A-Za-z0-9]{3,}/g;

/* Script alphabets used to catch a fragment from a language the file never
 * uses. Japanese caught a real one of these during this work: an Arabic word
 * inside a Japanese sentence parsed fine, kept the key count correct, and
 * passed the Latin-run check below because it contained no Latin at all. */
const SCRIPTS = {
  ru: { forbid: /[぀-ヿ㐀-䶿一-鿿가-힯]/g, name: 'CJK/Hangul' },
  ja: { forbid: /[Ѐ-ӿ가-힯؀-ۿ]/g, name: 'Cyrillic/Hangul/Arabic' },
  zh: { forbid: /[Ѐ-ӿ가-힯؀-ۿ]/g, name: 'Cyrillic/Hangul/Arabic' },
  ko: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿؀-ۿ]/g, name: 'Cyrillic/CJK/Arabic' },
  ar: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯]/g, name: 'Cyrillic/CJK/Hangul' },
  de: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, name: 'non-Latin script' },
  fr: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, name: 'non-Latin script' },
  es: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, name: 'non-Latin script' },
  it: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, name: 'non-Latin script' },
  pt: { forbid: /[Ѐ-ӿ㐀-䶿一-鿿぀-ヿ가-힯؀-ۿ]/g, name: 'non-Latin script' },
};

const wanted = process.argv.slice(2);
const locales = wanted.length ? wanted : ALL;

const en = JSON.parse(fs.readFileSync(path.join(I18N, 'en.json'), 'utf8'));
const pageKeys = Object.keys(en).filter((k) => /^(p-|menu-)/.test(k));

let problems = 0;

for (const locale of locales) {
  const file = path.join(PACKS, locale + '.json');
  if (!fs.existsSync(file)) {
    console.log(`[${locale}] dosya yok`);
    continue;
  }

  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  const issues = [];

  // Structure: the pack must carry exactly the page keys, no more, no less.
  const missing = pageKeys.filter((k) => !(k in pack));
  const extra = Object.keys(pack).filter((k) => !pageKeys.includes(k));
  if (missing.length) issues.push(`eksik anahtar (${missing.length}): ${missing.slice(0, 4).join(', ')}`);
  if (extra.length) issues.push(`fazla anahtar (${extra.length}): ${extra.slice(0, 4).join(', ')}`);

  for (const key of pageKeys) {
    const value = pack[key];
    if (typeof value !== 'string' || !value) continue;

    if (value === en[key] && !isLanguageNeutral(en[key])) {
      issues.push(`${key}: cevrilmemis (ingilizce ayni)`);
    }

    if (NON_LATIN.has(locale)) {
      const m = stripTerms(value).match(LONG_LATIN);
      if (m) issues.push(`${key}: yabanci latin -> ${[...new Set(m)].join(', ')}`);
    }

    const rule = SCRIPTS[locale];
    if (rule) {
      const m = value.match(rule.forbid);
      if (m) issues.push(`${key}: ${rule.name} -> ${[...new Set(m)].join('')}`);
    }
  }

  if (issues.length) {
    problems += issues.length;
    console.log(`\n[${locale}] ${issues.length} sorun`);
    for (const i of issues.slice(0, 12)) console.log('  ' + i);
    if (issues.length > 12) console.log(`  ... ve ${issues.length - 12} tane daha`);
  } else {
    console.log(`[${locale}] temiz (${pageKeys.length} anahtar)`);
  }
}

console.log(problems ? `\n${problems} sorun bulundu.` : '\nTum sayfa paketleri temiz.');
process.exit(problems ? 1 : 0);
