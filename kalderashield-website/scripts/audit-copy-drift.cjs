/* Reports keys whose inline markup text no longer matches en.json.
 *
 * The rework rewrote the hero, feature, security, comparison and FAQ copy.
 * A key that already existed keeps its stored translation, so the page would
 * silently show the previous wording instead of the new one. This lists the
 * mismatches so they can be reviewed before being overwritten.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const en = JSON.parse(fs.readFileSync(path.join(root, 'assets/js/i18n/en.json'), 'utf8'));

function decode(s) {
  // One pass, and the ampersand is decoded last. Decoding &amp; first would turn
  // the literal text "&amp;lt;" into "<", so a string that was escaped twice on
  // the way in came out escaped once too many -- which CodeQL reports as double
  // unescaping, and which would make two different sources compare equal.
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

const defaults = new Map();
for (const m of html.matchAll(/<(\w+)[^>]*data-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/g)) {
  defaults.set(m[2], decode(m[3]));
}

const mismatch = [];
for (const [key, markup] of defaults) {
  if (!Object.prototype.hasOwnProperty.call(en, key)) continue;
  if (en[key].replace(/\s+/g, ' ').trim() !== markup) {
    mismatch.push({ key, markup, stored: en[key] });
  }
}

console.log('markup ile en.json uyusmayan anahtar sayisi:', mismatch.length);
for (const m of mismatch) {
  console.log(`\n${m.key}`);
  console.log('  markup : ' + m.markup.slice(0, 110));
  console.log('  en.json: ' + m.stored.slice(0, 110));
}
