// Restores the two dictionaries the first pass of sync-claims mangled, to their
// pre-templating text so the corrected pattern can do the substitution properly.
const fs = require('fs');
const path = require('path');

const I18N = path.resolve(__dirname, '..', 'assets', 'js', 'i18n');

const FIX = {
  // French separates thousands with U+202F, which the first pattern's character
  // class did not contain, so it replaced only the " 204 " run.
  fr: '{{TESTCOUNT}} tests · 90 % de couverture',
  // Arabic-Indic digits are \p{Nd} but not [0-9], so the token was prepended and
  // the original digits were left behind next to it.
  ar: '{{TESTCOUNT}} اختبارًا · نسبة تغطية ٩٠٪',
};

for (const [locale, value] of Object.entries(FIX)) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  dict['badge-tests'] = value;
  fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  console.log(`${locale}.json badge-tests -> "${value}"`);
}