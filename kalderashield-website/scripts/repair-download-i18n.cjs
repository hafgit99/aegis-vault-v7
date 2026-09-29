// Fixes the download notice, which was Turkish in every language.
//
//   node scripts/repair-download-i18n.cjs
//
// Three separate defects on one line, and the third is the one that made the
// other two hard to see:
//
//   1. "<strong>Not:</strong>" had no data-i18n, so the label stayed Turkish.
//   2. The sentence after the keyed span had no data-i18n either.
//   3. dl-desc was used for three different sentences. The dictionary value
//      matches only the first -- the download page's hero line. Everywhere
//      else, translating replaced "Downloads are served from GitHub Releases"
//      with "Select your platform and deploy your encrypted offline vault in
//      seconds", so the notice rendered the hero copy in all twelve languages.
//      Two of the three sites were also on the same page, so the same sentence
//      appeared twice.
//
// A single key cannot carry two meanings, so the notice gets its own keys and
// the two stray dl-desc uses move to one that says what they meant.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const I18N_DIR = path.join(ROOT, 'assets', 'js', 'i18n');

const VALUES = {
  'dl-notice-label': {
    en: 'Note:', tr: 'Not:', de: 'Hinweis:', fr: 'Remarque :', es: 'Nota:',
    it: 'Nota:', pt: 'Nota:', ar: 'ملاحظة:', ru: 'Примечание:', ja: '注意：',
    ko: '참고:', zh: '注意：',
  },
  'dl-notice-releases': {
    en: 'Downloads are served from GitHub Releases.',
    tr: 'İndirmeler GitHub Releases üzerinden sunulur.',
    de: 'Downloads werden über GitHub Releases bereitgestellt.',
    fr: 'Les téléchargements sont distribués via GitHub Releases.',
    es: 'Las descargas se sirven desde GitHub Releases.',
    it: 'I download sono distribuiti tramite GitHub Releases.',
    pt: 'Os downloads são servidos pelo GitHub Releases.',
    ar: 'تُقدَّم التنزيلات عبر GitHub Releases.',
    ru: 'Загрузки публикуются в GitHub Releases.',
    ja: 'ダウンロードは GitHub Releases で提供されます。',
    ko: '다운로드는 GitHub Releases를 통해 제공됩니다.',
    zh: '下载通过 GitHub Releases 提供。',
  },
  'dl-notice-platforms': {
    en: 'Windows and macOS packages are not released yet, for the reasons set out below.',
    tr: 'Windows ve macOS paketleri aşağıda belirtilen nedenlerle henüz yayımlanmıyor.',
    de: 'Windows- und macOS-Pakete sind noch nicht veröffentlicht; die Gründe stehen unten.',
    fr: 'Les paquets Windows et macOS ne sont pas encore publiés, pour les raisons indiquées ci-dessous.',
    es: 'Los paquetes de Windows y macOS aún no se publican, por las razones indicadas abajo.',
    it: 'I pacchetti Windows e macOS non sono ancora pubblicati, per i motivi indicati sotto.',
    pt: 'Os pacotes de Windows e macOS ainda não são publicados, pelos motivos indicados abaixo.',
    ar: 'حزمتي Windows و macOS لم تُنشر بعد، للأسباب الموضحة أدناه.',
    ru: 'Пакеты для Windows и macOS пока не выпускаются по причинам, указанным ниже.',
    ja: 'Windows と macOS のパッケージは、下Reasons に記載した理由によりまだ公開されていません。',
    ko: 'Windows 및 macOS 패키지는 아래에 설명된 이유로 아직 공개되지 않았습니다.',
    zh: 'Windows 和 macOS 软件包尚未发布，原因见下文。',
  },
  // The longer sentence, used on the home page where the SHA-256 clause belongs.
  'dl-release-note': {
    en: 'Downloads are served from GitHub Releases; every release is published with its SHA-256 digest and signatures.',
    tr: 'İndirmeler GitHub Releases üzerinden sunulur; her sürüm SHA-256 özeti ve imzalarıyla birlikte yayımlanır.',
    de: 'Downloads werden über GitHub Releases bereitgestellt; jede Version wird mit SHA-256-Prüfsumme und Signaturen veröffentlicht.',
    fr: 'Les téléchargements sont distribués via GitHub Releases ; chaque version est publiée avec sa somme SHA-256 et ses signatures.',
    es: 'Las descargas se sirven desde GitHub Releases; cada versión se publica con su resumen SHA-256 y sus firmas.',
    it: 'I download sono distribuiti tramite GitHub Releases; ogni versione viene pubblicata con il relativo digest SHA-256 e le firme.',
    pt: 'Os downloads são servidos pelo GitHub Releases; cada versão é publicada com seu resumo SHA-256 e assinaturas.',
    ar: 'تُقدَّم التنزيلات عبر GitHub Releases؛ يُنشر كل إصدار مع بصمة SHA-256 والتوقيعات الخاصة به.',
    ru: 'Загрузки публикуются в GitHub Releases; каждый выпуск сопровождается хешем SHA-256 и подписями.',
    ja: 'ダウンロードは GitHub Releases で提供されます。各リリースは SHA-256 ダイジェストと署名付きで公開されます。',
    ko: '다운로드는 GitHub Releases를 통해 제공되며, 각 릴리스는 SHA-256 다이제스트와 서명과 함께 게시됩니다.',
    zh: '下载通过 GitHub Releases 提供；每个版本发布时都附带 SHA-256 摘要和签名。',
  },
};

const CODES = ['ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt', 'ru', 'tr', 'zh'];

// The notice on the download page, and the two home-page paragraphs that were
// also using dl-desc for a different sentence.
const EDITS = [
  {
    file: 'download/index.html',
    find:
      '<p><strong>Not:</strong> <span data-i18n="dl-desc">İndirmeler GitHub Releases üzerinden sunulur.</span> Windows ve macOS paketleri aşağıda belirtilen nedenlerle henüz yayımlanmıyor.</p>',
    replace:
      '<p><strong data-i18n="dl-notice-label">Not:</strong> ' +
      '<span data-i18n="dl-notice-releases">İndirmeler GitHub Releases üzerinden sunulur.</span> ' +
      '<span data-i18n="dl-notice-platforms">Windows ve macOS paketleri aşağıda belirtilen nedenlerle henüz yayımlanmıyor.</span></p>',
  },
  {
    // Both occurrences on this page are the "Downloads are served from GitHub
    // Releases..." paragraph, so the attribute is simply renamed. Matching on
    // the attribute rather than on the sentence avoids transcribing the
    // Turkish fallback by hand -- the first version of this edit did that and
    // wrote "imzaları" where the file says "imzalarla", so it silently matched
    // nothing.
    file: 'index.html',
    all: true,
    find: 'data-i18n="dl-desc"',
    replace: 'data-i18n="dl-release-note"',
  },
  {
    // Found by this file's own audit check, not by reading. The home page's
    // eyebrow said "Hemen Başlayın" ("Get Started") but carried data-i18n
    // "dl-title", whose value is "Get KalderaShield" -- the heading below it.
    // The download page uses dl-eyebrow for the identical element, and the key
    // dl-eyebrow = "Get Started" has been in the dictionary all along. So the
    // home page eyebrow rendered the heading's words in all twelve languages.
    // One key cannot carry two sentences; this is the same defect as dl-desc
    // above, in a place the dictionary looked perfectly consistent.
    file: 'index.html',
    all: true,
    find: 'data-i18n="dl-title"',
    replace: 'data-i18n="dl-eyebrow"',
  },
];

let htmlEdits = 0;
for (const edit of EDITS) {
  const file = path.join(ROOT, edit.file);
  const html = fs.readFileSync(file, 'utf8');
  const needle = edit.find ?? edit.all;
  if (!html.includes(needle)) {
    console.log(`  skipped ${edit.file}: expected markup not found`);
    continue;
  }
  const count = html.split(needle).length - 1;
  fs.writeFileSync(file, html.split(needle).join(edit.replace), 'utf8');
  htmlEdits += count;
  console.log(`  patched ${edit.file} (${count} site)`);
}

let written = 0;
for (const code of CODES) {
  const file = path.join(I18N_DIR, `${code}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, byLanguage] of Object.entries(VALUES)) {
    json[key] = byLanguage[code];
    written++;
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
}

console.log(`html: ${htmlEdits} site   i18n: ${written} deger / ${CODES.length} dil`);
