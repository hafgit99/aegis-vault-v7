/* Adds the 404 page's three strings to all twelve locales.
 *
 *   node scripts/add-404-i18n.cjs
 *
 * The 404 used to ship as untranslated Turkish markup, which is consistent with
 * the rest of the site's behaviour when a dictionary has not loaded -- but it
 * was the only page where the page language switcher could not actually change
 * the page. It now uses the dictionary like everything else.
 */
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');
const LANGS = ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar'];

const PACKS = {
  en: {
    'd404-title': 'The page you asked for has moved, or never existed.',
    'd404-desc': 'It may be a mistyped link, or the page may have been renamed. These are the ways back.',
    'd404-home': 'Home',
  },
  tr: {
    'd404-title': 'Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.',
    'd404-desc': 'Bağlantı yazım hatası olabilir ya da sayfa yeniden adlandırılmış olabilir. Buradan devam edebilirsiniz.',
    'd404-home': 'Ana sayfa',
  },
  de: {
    'd404-title': 'Die gesuchte Seite wurde verschoben oder hat nie existiert.',
    'd404-desc': 'Vielleicht ist der Link falsch geschrieben oder die Seite wurde umbenannt. Hier geht es zurück.',
    'd404-home': 'Startseite',
  },
  fr: {
    'd404-title': 'La page demandée a été déplacée ou n’a jamais existé.',
    'd404-desc': 'Le lien est peut-être mal saisi, ou la page a été renommée. Voici les chemins de retour.',
    'd404-home': 'Accueil',
  },
  es: {
    'd404-title': 'La página solicitada se ha movido o nunca existió.',
    'd404-desc': 'Puede que el enlace esté mal escrito o que la página se haya renombrado. Estas son las vías de vuelta.',
    'd404-home': 'Inicio',
  },
  it: {
    'd404-title': 'La pagina richiesta è stata spostata o non è mai esistita.',
    'd404-desc': 'Il link potrebbe contenere un errore di battitura oppure la pagina è stata rinominata. Ecco come tornare indietro.',
    'd404-home': 'Home',
  },
  pt: {
    'd404-title': 'A página que você procura foi movida ou nunca existiu.',
    'd404-desc': 'O link pode estar escrito incorretamente ou a página pode ter sido renomeada. Estes são os caminhos de volta.',
    'd404-home': 'Início',
  },
  ru: {
    'd404-title': 'Запрошенная страница перемещена или никогда не существовала.',
    'd404-desc': 'В ссылке может быть опечатка, либо страница была переименована. Вот как вернуться.',
    'd404-home': 'Главная',
  },
  ja: {
    'd404-title': 'お探しのページは移動したか、元から存在しません。',
    'd404-desc': 'リンクの入力ミスか、ページ名の変更かもしれません。ここから戻れます。',
    'd404-home': 'ホーム',
  },
  ko: {
    'd404-title': '찾으시는 페이지가 이동했거나 처음부터 존재하지 않았습니다.',
    'd404-desc': '링크가 잘못 입력되었거나 페이지 이름이 바뀐 것일 수 있습니다. 여기서 다시 시작할 수 있습니다.',
    'd404-home': '홈',
  },
  zh: {
    'd404-title': '您访问的页面已被移动，或从未存在。',
    'd404-desc': '可能是链接拼写有误，或页面已更名。以下是返回的路径。',
    'd404-home': '首页',
  },
  ar: {
    'd404-title': 'الصفحة التي تبحث عنها نُقلت أو لم تكن موجودة أصلًا.',
    'd404-desc': 'قد يكون الرابط مكتوبًا خطأً أو تكون الصفحة أُعيدت تسميتها. وهذه هي طرق العودة.',
    'd404-home': 'الصفحة الرئيسية',
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