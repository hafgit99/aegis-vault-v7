/* Validates the translation packs before they are merged.
 *
 * Gate, not a lint hint: these packs carry security claims in twelve
 * languages, and a stray English word inside a Japanese sentence ("サーバーの
 * 運営antisquat継続") parses fine, keeps the key count right, and ships.
 *
 * The check is on the packs rather than the merged dictionaries, because the
 * dictionaries legitimately contain Latin product names all over the download
 * page ("Native Messaging", "AppImage", "Minisign"). A fresh pack should not.
 *
 *   node scripts/audit-packs.cjs
 */
const fs = require('fs');
const path = require('path');

const PACKS = path.resolve(__dirname, '..', 'i18n-packs');
const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

// Terms that stay in Latin script on purpose: product names, algorithms,
// platform names, file extensions and protocol identifiers.
const OK_LATIN = new Set([
  'KalderaShield', 'AES', 'GCM', 'Argon', 'Argon2id', 'id', 'HMAC', 'SHA',
  'SHA-256', 'HKDF', 'WebCrypto', 'SQLite', 'OPFS', 'TOTP', 'WebAuthn',
  'FIDO2', 'YubiKey', 'CSV', 'JSON', 'HTTP', 'HTTPS', 'TLS', 'BIP-39',
  'PBKDF2', 'OpenSSF', 'Scorecard', 'CodeQL', 'Bitwarden', 'LastPass',
  'Password', 'Chrome', 'Edge', 'Firefox', 'Safari', 'Windows', 'macOS',
  'Android', 'Linux', 'TypeScript', 'Apache', 'GitHub', 'security', 'txt',
  'Tauri', 'React', 'PRF', 'MS', 'MiB', 'IT', 'MiB', 'WASM', 'eTLD',
  'DMG', 'APK', 'CRX', 'XPI', 'MSI', 'EXE', 'ZIP', 'DEB', 'RPM', 'NSIS',
  'ARM', 'ARM64', 'ARMv7', 'v8a', 'v7a', 'x86', '64', 'Wi', 'ID', 'IDs',
  'CLI', 'GPU', 'CPU', 'USB', 'PIN', 'CVV', 'IBAN', 'URL', 'URLs', 'API',
  'SDK', 'OS', 'UI', 'UX', 'IP', 'SSO', 'DNS', 'NAT', 'RAM', 'SSD', 'IPC',
  'TLS', 'HMAC', 'KDF', 'AEAD', 'Q', 'W', 'E', 'A', 'D', 'S', 'Z', 'X',
  'Mozilla', 'Public', 'Suffix', 'List', 'WebDAV', 'Nextcloud', 'Hello',
  'Touch', 'Face', 'iOS', 'Sigstore', 'Minisign', 'SmartScreen',
  'Chromium', 'AppImage', 'Native', 'Messaging', 'Debian', 'Ubuntu',
  'Server', 'Client', 'Vault', 'Shield', 'Sub', 'Kits', 'Every',
  'Diceware', 'Secure', 'Enclave', 'AndroidKeyStore', 'Best', 'Practices',
  'Windows', 'Linux', 'CodeQL', 'Scorecard', 'Biometrics',
  'Passkey', 'passkeys', 'HKDF-SHA256', 'SHA256', 'Argon', 'TOTP',
  'passkey', 'advisories',
]);

// A Latin run this long is almost certainly a leaked word, not a product name.
// Digits stay in the token so "FIDO2" and "PBKDF2-SHA256" are matched whole
// instead of being reported as the truncated "FIDO" and "PBKDF".
const LONG_LATIN = /[A-Za-z][A-Za-z0-9]{3,}/g;

// The Latin-run check only means anything where Latin script is not the
// writing system. German, Turkish and the rest legitimately spell everything
// in Latin letters, so the rule is scoped to those four locales.
const NON_LATIN = new Set(['ja', 'zh', 'ko', 'ar', 'ru']);

const packs = fs.readdirSync(PACKS).filter((f) => f.endsWith('.json')).sort();
let problems = 0;

for (const file of packs) {
  const locale = path.basename(file, '.json');
  const pack = JSON.parse(fs.readFileSync(path.join(PACKS, file), 'utf8'));

  for (const [key, value] of Object.entries(pack)) {
    if (typeof value !== 'string' || !NON_LATIN.has(locale)) continue;
    for (const run of value.match(LONG_LATIN) || []) {
      if (OK_LATIN.has(run)) continue;
      problems++;
      console.log(`[${locale}] ${key}: taninmamis Latin dizi "${run}"`);
      console.log(`    ${value.slice(0, 110)}`);
    }
  }

  // Every pack must cover the same keys the merged English file carries,
  // otherwise a locale ends up silently half-translated.
  const en = JSON.parse(fs.readFileSync(path.join(I18N, 'en.json'), 'utf8'));
  const missing = Object.keys(pack).filter((k) => !(k in en));
  const notInPack = Object.keys(en).filter((k) => !(k in pack));
  if (missing.length) {
    problems++;
    console.log(`[${locale}] paket anahtarlari en.json'da yok: ${missing.join(', ')}`);
  }
  if (notInPack.length) {
    console.log(`[${locale}] en.json'daki ${notInPack.length} anahtar pakette yok (bilerek olabilir): ${notInPack.slice(0, 8).join(', ')}`);
  }
}

console.log(problems
  ? `\n${problems} sorun bulundu.`
  : `Sorun yok: ${packs.length} paket temiz.`);
process.exit(problems ? 1 : 0);
