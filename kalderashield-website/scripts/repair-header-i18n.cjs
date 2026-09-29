// Repairs the five header-control strings that were written through a shell
// pipeline and lost every non-ASCII code point.
//
//   node scripts/repair-header-i18n.cjs
//
// tr came out as "A??k" and ar, ru, ja, ko and zh came out as runs of "?".
// The cause was mechanical rather than linguistic: the values were passed
// through a PowerShell here-string, which replaces code points outside Latin-1
// with "?", and JSON.stringify then wrote a well-formed file full of
// placeholders. Every existing check passed it, because a string of question
// marks is a non-empty string with no stray script in it -- which is the gap
// audit-i18n.cjs now closes with its letterless-value check.
//
// Idempotent: each assignment is unconditional, and running it twice writes the
// same bytes.

const fs = require('fs');
const path = require('path');

const I18N_DIR = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const VALUES = {
  'lang-switch-label': {
    en: 'Choose language',
    tr: 'Dil seç',
    de: 'Sprache wählen',
    fr: 'Choisir la langue',
    es: 'Elegir idioma',
    it: 'Scegli lingua',
    pt: 'Escolher idioma',
    ar: 'اختر اللغة',
    ru: 'Выбрать язык',
    ja: '言語を選択',
    ko: '언어 선택',
    zh: '选择语言',
  },
  'theme-switch-label': {
    en: 'Choose theme',
    tr: 'Tema seç',
    de: 'Design wählen',
    fr: 'Choisir le thème',
    es: 'Elegir tema',
    it: 'Scegli tema',
    pt: 'Escolher tema',
    ar: 'اختر المظهر',
    ru: 'Выбрать тему',
    ja: 'テーマを選択',
    ko: '테마 선택',
    zh: '选择主题',
  },
  'theme-light': {
    en: 'Light',
    tr: 'Açık',
    de: 'Hell',
    fr: 'Clair',
    es: 'Claro',
    it: 'Chiaro',
    pt: 'Claro',
    ar: 'فاتح',
    ru: 'Светлая',
    ja: 'ライト',
    ko: '라이트',
    zh: '浅色',
  },
  'theme-dark': {
    en: 'Dark',
    tr: 'Koyu',
    de: 'Dunkel',
    fr: 'Sombre',
    es: 'Oscuro',
    it: 'Scuro',
    pt: 'Escuro',
    ar: 'داكن',
    ru: 'Тёмная',
    ja: 'ダーク',
    ko: '다크',
    zh: '深色',
  },
  'theme-system': {
    en: 'System',
    tr: 'Sistem',
    de: 'System',
    fr: 'Système',
    es: 'Sistema',
    it: 'Sistema',
    pt: 'Sistema',
    ar: 'النظام',
    ru: 'Системная',
    ja: 'システム',
    ko: '시스템',
    zh: '跟随系统',
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

console.log(`repaired ${written} values across ${CODES.length} locales`);
