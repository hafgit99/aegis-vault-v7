/* Adds the download-page redesign copy to all twelve locales.
 *
 *   node scripts/add-download-page-i18n.cjs
 *
 * The /download/ page rewrite needed twelve new strings: the quick-download
 * panel's heading, the platform section's heading, the rail's accessible name,
 * the six format hints, the CLI paragraph that had been sitting on the page as
 * untranslated Turkish, the "not published yet" status, and the verification
 * band's eyebrow.
 *
 * Everything else on that page reuses keys the site already carries in all
 * twelve languages, so a reader switching language never lands on a section
 * whose heading is in a different language from its body.
 *
 * The same constraints audit-i18n.cjs enforces apply: no markup, no braces, no
 * SCREAMING_SNAKE tokens, no foreign script.
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const LANGS = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

const PACKS = {
  en: {
    'dl-pick': 'Quick download',
    'dl-platforms-title': 'Download for your platform',
    'dl-rail-label': 'Jump to a platform',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · every distribution',
    'dl-fmt-apk': 'all architectures',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · signed by AMO',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'The script fetches the version number and the SHA-256 digests from GitHub Releases while it runs, compares them against SHA256SUMS.txt, and stops the installation if anything does not match.',
    'dl-not-yet': 'Not published yet',
    'dl-verify-eyebrow': 'Verification',
  },

  tr: {
    'dl-pick': 'Hızlı indirme',
    'dl-platforms-title': 'Platforma göre indirin',
    'dl-rail-label': 'Platforma göre atla',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · tüm dağıtımlar',
    'dl-fmt-apk': 'tüm mimariler',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · AMO imzalı',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'Betik, sürüm numarasını ve SHA-256 özetlerini çalışma anında GitHub Releases üzerinden çeker; özetler SHA256SUMS.txt ile karşılaştırılır ve eşleşmezse kurulum durdurulur.',
    'dl-not-yet': 'Henüz yayımlanmadı',
    'dl-verify-eyebrow': 'Doğrulama',
  },

  de: {
    'dl-pick': 'Schnelldownload',
    'dl-platforms-title': 'Für Ihre Plattform herunterladen',
    'dl-rail-label': 'Zu einer Plattform springen',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · jede Distribution',
    'dl-fmt-apk': 'alle Architekturen',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · von AMO signiert',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'Das Skript holt sich die Versionsnummer und die SHA-256-Prüfsummen während der Ausführung von GitHub Releases, vergleicht sie mit SHA256SUMS.txt und bricht die Installation ab, wenn etwas nicht übereinstimmt.',
    'dl-not-yet': 'Noch nicht veröffentlicht',
    'dl-verify-eyebrow': 'Verifikation',
  },

  fr: {
    'dl-pick': 'Téléchargement rapide',
    'dl-platforms-title': 'Téléchargez pour votre plateforme',
    'dl-rail-label': 'Aller à une plateforme',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · toutes les distributions',
    'dl-fmt-apk': 'toutes architectures',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · signé par AMO',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': "Pendant son exécution, le script récupère le numéro de version et les empreintes SHA-256 depuis GitHub Releases, les compare à SHA256SUMS.txt et interrompt l'installation si quoi que ce soit ne correspond pas.",
    'dl-not-yet': 'Pas encore publié',
    'dl-verify-eyebrow': 'Vérification',
  },

  es: {
    'dl-pick': 'Descarga rápida',
    'dl-platforms-title': 'Descargue para su plataforma',
    'dl-rail-label': 'Ir a una plataforma',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · cualquier distribución',
    'dl-fmt-apk': 'todas las arquitecturas',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · firmado por AMO',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'El script obtiene el número de versión y las huellas SHA-256 desde GitHub Releases mientras se ejecuta, las compara con SHA256SUMS.txt y detiene la instalación si algo no coincide.',
    'dl-not-yet': 'Todavía no publicado',
    'dl-verify-eyebrow': 'Verificación',
  },

  it: {
    'dl-pick': 'Download rapido',
    'dl-platforms-title': 'Scarica per la tua piattaforma',
    'dl-rail-label': 'Vai a una piattaforma',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · ogni distribuzione',
    'dl-fmt-apk': 'tutte le architetture',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · firmato da AMO',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'Lo script recupera il numero di versione e le impronte SHA-256 da GitHub Releases mentre è in esecuzione, le confronta con SHA256SUMS.txt e interrompe l’installazione se qualcosa non corrisponde.',
    'dl-not-yet': 'Non ancora pubblicato',
    'dl-verify-eyebrow': 'Verifica',
  },

  pt: {
    'dl-pick': 'Download rápido',
    'dl-platforms-title': 'Baixe para a sua plataforma',
    'dl-rail-label': 'Ir para uma plataforma',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · qualquer distribuição',
    'dl-fmt-apk': 'todas as arquiteturas',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · assinado pela AMO',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'O script busca o número da versão e as somas SHA-256 no GitHub Releases enquanto é executado, compara com SHA256SUMS.txt e interrompe a instalação se algo não corresponder.',
    'dl-not-yet': 'Ainda não publicado',
    'dl-verify-eyebrow': 'Verificação',
  },

  ru: {
    'dl-pick': 'Быстрая загрузка',
    'dl-platforms-title': 'Загрузка для вашей платформы',
    'dl-rail-label': 'Перейти к платформе',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · любой дистрибутив',
    'dl-fmt-apk': 'все архитектуры',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · подписан AMO',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'Скрипт во время работы получает номер версии и контрольные суммы SHA-256 из GitHub Releases, сверяет их с SHA256SUMS.txt и останавливает установку, если что-то не совпало.',
    'dl-not-yet': 'Ещё не опубликовано',
    'dl-verify-eyebrow': 'Проверка',
  },

  ja: {
    'dl-pick': 'クイックダウンロード',
    'dl-platforms-title': 'プラットフォームごとのダウンロード',
    'dl-rail-label': 'プラットフォームへ移動',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · すべてのディストリビューション',
    'dl-fmt-apk': 'すべてのアーキテクチャ',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · AMO の署名付き',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'スクリプトは実行時に GitHub Releases からバージョン番号と SHA-256 チェックサムを取得し、SHA256SUMS.txt と照合します。一致しない場合はインストールを中止します。',
    'dl-not-yet': '未公開',
    'dl-verify-eyebrow': '検証',
  },

  ko: {
    'dl-pick': '빠른 다운로드',
    'dl-platforms-title': '플랫폼별 다운로드',
    'dl-rail-label': '플랫폼으로 이동',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · 모든 배포판',
    'dl-fmt-apk': '모든 아키텍처',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · AMO 서명됨',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': '스크립트는 실행 중에 GitHub Releases에서 버전 번호와 SHA-256 체크섬을 받아 SHA256SUMS.txt와 비교하며, 하나라도 맞지 않으면 설치를 중단합니다.',
    'dl-not-yet': '아직 공개되지 않음',
    'dl-verify-eyebrow': '검증',
  },

  zh: {
    'dl-pick': '快速下载',
    'dl-platforms-title': '按平台下载',
    'dl-rail-label': '跳转到某个平台',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · 适用于所有发行版',
    'dl-fmt-apk': '全部架构',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · 经 AMO 签名',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': '脚本在运行时从 GitHub Releases 获取版本号和 SHA-256 校验值，与 SHA256SUMS.txt 比对；只要有一项不符就会中止安装。',
    'dl-not-yet': '尚未发布',
    'dl-verify-eyebrow': '验证',
  },

  ar: {
    'dl-pick': 'تنزيل سريع',
    'dl-platforms-title': 'نزّل لمنصتك',
    'dl-rail-label': 'الانتقال إلى منصة',
    'dl-fmt-deb': '.deb · Debian / Ubuntu',
    'dl-fmt-appimage': '.AppImage · كل التوزيعات',
    'dl-fmt-apk': 'كل البنى',
    'dl-fmt-chromium': '.zip · Chromium',
    'dl-fmt-xpi': '.xpi · موقَّع من AMO',
    'dl-fmt-webext': '.webextension · Safari',
    'dl-cli-note': 'يجلب السكربت رقم الإصدار وبصمات SHA-256 من GitHub Releases أثناء تشغيله، ويقارنها بـ SHA256SUMS.txt، ويوقف التثبيت إذا لم يتطابق أي منها.',
    'dl-not-yet': 'لم يُنشر بعد',
    'dl-verify-eyebrow': 'التحقق',
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
  console.log(`${lang}.json: +${Object.keys(PACKS[lang]).length} anahtar`);
}
console.log(`${LANGS.length} dil guncellendi (${expectedKeys.length} anahtar).`);