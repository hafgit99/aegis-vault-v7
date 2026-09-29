// Makes the four shared technical terms uniform across the twelve locales.
//
//   node scripts/normalise-terms.cjs
//
// Two distinct problems, and only one of them is a style choice.
//
// The factual one: tr `comp-r5-c2` read "WebAuthn PRF & Windows Hello" and had
// dropped "/ Touch ID". Every other locale carried it. That is not a
// translation preference -- Touch ID is a shipped capability, and the Turkish
// string was telling readers the product does not have it.
//
// The stylistic one: "Zero-Knowledge" is a cryptographic property, not a
// product name, and six locales translated it while six kept it English, and
// some locales did both in different keys -- es had "Conocimiento Cero" in
// `snap-f2-title` and "Zero-Knowledge" in `comp-r4-c1`. The rule applied here:
//
//   translated  the concept (Zero-Knowledge, Sandbox, Offline)
//   kept         product and standard names (KalderaShield, SQLite, OPFS,
//               WebAuthn, Windows Hello, Touch ID, Argon2id, AES-256-GCM,
//               Local-First, Air-Gap)
//
// A locale either translates the concept in all three keys or in none.

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const VALUES = {
  'feat-c1-title': {
    en: 'Local-First: SQLite & OPFS Sandbox',
    tr: 'Local-First: SQLite & OPFS Sandbox',
    de: 'Local-First: SQLite & OPFS-Sandbox',
    fr: 'Local-First: SQLite & sandbox OPFS',
    es: 'Local-First: SQLite y sandbox OPFS',
    it: 'Local-First: SQLite e sandbox OPFS',
    pt: 'Local-First: SQLite e sandbox OPFS',
    ar: 'محلي أولاً: SQLite & OPFS Sandbox',
    ru: 'Local-First: SQLite и OPFS Sandbox',
    ja: 'Local-First: SQLite & OPFS サンドボックス',
    ko: 'Local-First: SQLite & OPFS 샌드박스',
    zh: 'Local-First: SQLite 与 OPFS 沙箱',
  },
  'snap-f2-title': {
    en: 'Zero-Knowledge AES-256-GCM & Argon2id',
    tr: 'Sıfır-Bilgi AES-256-GCM & Argon2id',
    de: 'Nullwissen AES-256-GCM & Argon2id',
    fr: 'Zéro-Connaissance AES-256-GCM & Argon2id',
    es: 'Conocimiento Cero AES-256-GCM & Argon2id',
    it: 'Conoscenza Zero AES-256-GCM & Argon2id',
    pt: 'Conhecimento Zero AES-256-GCM & Argon2id',
    ar: 'معرفة صفرية AES-256-GCM و Argon2id',
    ru: 'Нулевое разглашение AES-256-GCM & Argon2id',
    ja: 'ゼロ知識 AES-256-GCM & Argon2id',
    ko: '제로 지식 AES-256-GCM & Argon2id',
    zh: '零知识 AES-256-GCM 与 Argon2id',
  },
  // "Air-Gap" is kept as the English idiom everywhere: it has no settled
  // equivalent, and translating it differently per locale is what produced the
  // inconsistency this file removes.
  'comp-r4-c1': {
    en: 'Zero-Knowledge & Air-Gap',
    tr: 'Sıfır-Bilgi & Air-Gap',
    de: 'Nullwissen & Air-Gap',
    fr: 'Zéro-Connaissance & Air-Gap',
    es: 'Conocimiento Cero & Air-Gap',
    it: 'Conoscenza Zero & Air-Gap',
    pt: 'Conhecimento Zero & Air-Gap',
    ar: 'المعرفة الصفرية & Air-Gap',
    ru: 'Нулевое разглашение & Air-Gap',
    ja: 'ゼロ知識 & Air-Gap',
    ko: '제로 지식 & Air-Gap',
    zh: '零知识 & Air-Gap',
  },
  // Restored for Turkish. Touch ID is supported on macOS builds, so the missing
  // half was a capability claim, not a wording choice.
  'comp-r5-c2': {
    en: 'WebAuthn PRF & Windows Hello / Touch ID',
    tr: 'WebAuthn PRF & Windows Hello / Touch ID',
    de: 'WebAuthn PRF & Windows Hello / Touch ID',
    fr: 'WebAuthn PRF & Windows Hello / Touch ID',
    es: 'WebAuthn PRF y Windows Hello / Touch ID',
    it: 'WebAuthn PRF e Windows Hello / Touch ID',
    pt: 'WebAuthn PRF e Windows Hello / Touch ID',
    ar: 'WebAuthn PRF و Windows Hello / Touch ID',
    ru: 'WebAuthn PRF и Windows Hello / Touch ID',
    ja: 'WebAuthn PRF & Windows Hello / Touch ID',
    ko: 'WebAuthn PRF & Windows Hello / Touch ID',
    zh: 'WebAuthn PRF & Windows Hello / Touch ID',
  },
  'breach-pill-2': {
    en: '100% Offline & Zero-Knowledge',
    tr: '%100 Çevrimdışı & Sıfır-Bilgi',
    de: '100 % Offline & Nullwissen',
    fr: '100 % Hors Ligne & Zéro-Connaissance',
    es: '100 % Sin Conexión & Conocimiento Cero',
    it: '100% Offline e Conoscenza Zero',
    pt: '100% Offline e Conhecimento Zero',
    ar: '100% دون اتصال & معرفة صفرية',
    ru: '100% Офлайн и Нулевое разглашение',
    ja: '100% オフライン & ゼロ知識',
    ko: '100% 오프라인 & 제로 지식',
    zh: '100% 离线 & 零知识',
  },
  'footer-link-support': {
    en: 'Support & Contact (admin@{{DOMAIN}})',
    tr: 'Destek & İletişim (admin@{{DOMAIN}})',
    de: 'Support & Kontakt (admin@{{DOMAIN}})',
    fr: 'Assistance & Contact (admin@{{DOMAIN}})',
    es: 'Soporte y Contacto (admin@{{DOMAIN}})',
    it: 'Supporto e Contatti (admin@{{DOMAIN}})',
    pt: 'Suporte e Contato (admin@{{DOMAIN}})',
    ar: 'الدعم والتواصل (admin@{{DOMAIN}})',
    ru: 'Поддержка и контакты (admin@{{DOMAIN}})',
    ja: 'サポート・お問い合わせ (admin@{{DOMAIN}})',
    ko: '지원 및 문의 (admin@{{DOMAIN}})',
    zh: '技术支持与联系 (admin@{{DOMAIN}})',
  },
};

const CODES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

let written = 0;
for (const code of CODES) {
  const file = path.join(I18N_DIR, `${code}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, byLanguage] of Object.entries(VALUES)) {
    if (!Object.prototype.hasOwnProperty.call(byLanguage, code)) {
      throw new Error(`${code} has no value for ${key}`);
    }
    json[key] = byLanguage[code];
    written++;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

console.log(`normalised ${written} values across ${CODES.length} locales`);
