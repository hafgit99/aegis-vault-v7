/* Second pass on the /download/ copy, after the first one rendered.
 *
 *   node scripts/add-download-page-i18n-2.cjs
 *
 * Three fixes, all of them things only a rendered page shows:
 *
 *   1. The hero's primary button had been pointed at `audit-lk-sums`, which is
 *      "SHA-256 digests" -- a noun phrase for a file, not an action. As the
 *      first button on the download page it read as though the page were
 *      offering a checksum instead of a download.
 *   2. The Android card carried two different minimum versions. `dl-c6-desc`
 *      said "Android 10+" and `and-req` said "Android 9.0 (API 28)", on the same
 *      card. The requirement line is the one the rest of the site agrees with,
 *      so the description now makes no version claim at all.
 *   3. The browser card had lost its format column in the first pass, so the
 *      reader could not tell an unsigned XPI from a Chromium zip without
 *      opening the release page.
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const LANGS = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

const PACKS = {
  en: {
    'dl-releases': 'All releases',
    'dl-android-desc': 'Hardware-backed Keystore and Biometric API integration.',
  },
  tr: {
    'dl-releases': 'Tüm sürümler',
    'dl-android-desc': 'Donanım destekli Keystore ve Biyometrik API entegrasyonu.',
  },
  de: {
    'dl-releases': 'Alle Versionen',
    'dl-android-desc': 'In Hardware abgesicherte Keystore- und Biometrie-API-Integration.',
  },
  fr: {
    'dl-releases': 'Toutes les versions',
    'dl-android-desc': 'Intégration du Keystore adossé au matériel et de l’API biométrique.',
  },
  es: {
    'dl-releases': 'Todas las versiones',
    'dl-android-desc': 'Integración con Keystore respaldado por hardware y la API biométrica.',
  },
  it: {
    'dl-releases': 'Tutte le versioni',
    'dl-android-desc': 'Integrazione con Keystore protetto dall’hardware e API biometrica.',
  },
  pt: {
    'dl-releases': 'Todas as versões',
    'dl-android-desc': 'Integração com Keystore apoiado por hardware e API biométrica.',
  },
  ru: {
    'dl-releases': 'Все версии',
    'dl-android-desc': 'Интеграция с аппаратным Keystore и Биометрическим API.',
  },
  ja: {
    'dl-releases': 'すべてのバージョン',
    'dl-android-desc': 'ハードウェアキーストアと Biometric API の統合。',
  },
  ko: {
    'dl-releases': '모든 버전',
    'dl-android-desc': '하드웨어 기반 Keystore와 Biometric API 통합.',
  },
  zh: {
    'dl-releases': '所有版本',
    'dl-android-desc': '集成硬件级 Keystore 与 Biometric API。',
  },
  ar: {
    'dl-releases': 'كل الإصدارات',
    'dl-android-desc': 'تكامل مع Keystore المدعوم بالعتاد وواجهة Biometric API.',
  },
};

const expectedKeys = Object.keys(PACKS.en);
for (const [lang, pack] of Object.entries(PACKS)) {
  const keys = Object.keys(pack);
  if (keys.length !== expectedKeys.length || keys.some((k, i) => k !== expectedKeys[i])) {
    throw new Error(`${lang}.json pack does not match en.json's key set`);
  }
}

for (const lang of LANGS) {
  const file = path.join(I18N, lang + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(PACKS[lang])) {
    if (dict[key] !== undefined) {
      throw new Error(`${lang}.json already defines ${key}; refusing to overwrite a key in use`);
    }
    dict[key] = value;
  }
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
}
console.log(`${LANGS.length} dil guncellendi (${expectedKeys.length} anahtar).`);