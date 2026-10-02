#!/usr/bin/env node
/* Keeps the literal path in the source-code answer intact.
 *
 * "release-local/<platform>/" is a real directory, not a placeholder to
 * translate: the release script writes there and the guide tells you where to
 * look.
 *
 * Spanish had translated the token, giving release-local/<plataforma>/, a
 * directory that does not exist. That is fixed here.
 *
 * The stray </platform> that used to end the Turkish sentence was not in the
 * dictionaries at all. It appeared in the rendered pages because the value
 * contains a <, which made the translator treat it as markup and hand it to
 * innerHTML; the browser then parsed <platform> as an unknown element and closed
 * it at the end of the sentence. assets/js/i18n-apply.js now only assigns
 * innerHTML for a known list of tags, which fixes it in all twelve languages
 * without changing a word.
 *
 * Japanese dropped the path entirely and states only that artefacts carry
 * SHA-256 checksums. That is a translation gap rather than a bug -- the sentence
 * is accurate -- so it is reported, not rewritten. Writing Japanese copy here
 * would be inventing a translation, and a wrong one in a security document is
 * worse than an absent detail.
 *
 * Idempotent.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const I18N = path.join(root, 'assets', 'js', 'i18n');
const KEY = 'p-kaynak-kodu-faq3-a';

const findings = [];
let changed = 0;

for (const locale of ['tr', 'en', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'ja', 'ko', 'zh', 'ar']) {
  const file = path.join(I18N, locale + '.json');
  const dict = JSON.parse(fs.readFileSync(file, 'utf8'));
  const value = dict[KEY];
  if (typeof value !== 'string') continue;

  let next = value;

  // A closing tag with nothing to close. Only reachable if one is reintroduced
  // into a dictionary by hand; the render-time cause was fixed elsewhere.
  if (/<\/platform>\s*$/.test(next)) {
    next = next.replace(/<\/platform>\s*$/, '');
    findings.push(`${locale}: basibosuz </platform> kaldirildi`);
  }

  // The token is a literal path segment.
  const localised = next.match(/release-local\/<[^>]*>\//);
  if (localised && localised[0] !== 'release-local/<platform>/') {
    next = next.replace(localised[0], 'release-local/<platform>/');
    findings.push(`${locale}: yol tokeni "${localised[0]}" literal olarak duzeltildi`);
  }

  if (next !== value) {
    dict[KEY] = next;
    fs.writeFileSync(file, JSON.stringify(dict, null, 2) + '\n', 'utf8');
    changed++;
  }
}

if (findings.length) {
  for (const f of findings) console.log('  ' + f);
}
console.log(`${KEY}: ${changed} dil duzeltildi.`);

// The Japanese gap, stated plainly rather than papered over.
const ja = JSON.parse(fs.readFileSync(path.join(I18N, 'ja.json'), 'utf8'));
if (typeof ja[KEY] === 'string' && !ja[KEY].includes('release-local/')) {
  console.log('');
  console.log('  NOT: ja.json bu yanitta "release-local/<platform>/" yolunu hic yazmiyor.');
  console.log('       Cumle dogru oldugu icin birakildi; ceviri eklenmeli.');
}