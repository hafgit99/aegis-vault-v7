/* Writes one translation scaffold per locale that still lacks the product-page
 * strings. Each file holds the current dictionary value, falling back to the
 * English source for keys the locale does not have yet.
 *
 * It seeds from the locale's own dictionary rather than from en.json: an
 * earlier version overwrote every file with English, silently discarding 240
 * keys of finished translation each time a new page was added.
 *
 *   node scripts/make-page-scaffolds.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const OUT = path.join(root, 'i18n-pages');

const LANGS = ['de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'zh', 'ko', 'ar'];

const en = JSON.parse(fs.readFileSync(path.join(I18N, 'en.json'), 'utf8'));
const keys = Object.keys(en).filter((k) => /^(p-|menu-)/.test(k));

fs.mkdirSync(OUT, { recursive: true });

for (const lang of LANGS) {
  const file = path.join(OUT, lang + '.json');
  // Attempted, not tested for. existsSync() then readFileSync() leaves a window
  // in which the file can change, which CodeQL reports as a file-system race;
  // the catch covers a missing file and an unreadable one identically, which is
  // what the caller wanted anyway -- an empty scaffold to fill in.
  let own = {};
  try {
    own = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    own = {};
  }
  const dict = JSON.parse(fs.readFileSync(path.join(I18N, lang + '.json'), 'utf8'));

  const scaffold = {};
  let kept = 0;
  let fromEnglish = 0;
  for (const k of keys) {
    // Take the first value that is actually translated. Comparing against the
    // English source matters: a pack file that still holds English (because an
    // earlier run overwrote it) must not win over the live dictionary.
    const value =
      own[k] && own[k] !== en[k] ? own[k]
      : dict[k] && dict[k] !== en[k] ? dict[k]
      : own[k] || en[k];
    scaffold[k] = value;
    if (value !== en[k]) kept++;
    else fromEnglish++;
  }

  fs.writeFileSync(file, JSON.stringify(scaffold, null, 2) + '\n', 'utf8');
  console.log(`${lang}.json: ${keys.length} anahtar (korunan ${kept}, ingilizce ${fromEnglish})`);
}
