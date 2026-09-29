// Rebrands the AegisVault site translation files to KalderaShield.
//
// Keys are renamed alongside values where the key itself carries the old
// brand, so the data-i18n attributes in the markup have to use the new name.
// The comparison table column is renamed for the same reason.
//
// The contact address is left as an obvious placeholder: the domain has not
// been chosen yet, and a published site must not ship a broken address.
// scripts/check-placeholders.cjs fails the deploy if one survives.

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'aegisvault-website', 'js', 'i18n');
const DST = path.join(__dirname, '..', 'kalderashield-website', 'assets', 'js', 'i18n');

const DOMAIN_PLACEHOLDER = 'admin@{{DOMAIN}}';

// Order matters. Longest and most specific first, so that "AegisVault" is
// not partially consumed by the bare "Aegis" rule and so that ".aegis" is
// replaced before "aegisvault.xyz" can be mangled by it.
const RULES = [
  [/admin@aegisvault\.xyz/g, DOMAIN_PLACEHOLDER],
  [/AegisVault/g, 'KalderaShield'],
  // Bare "Aegis" left over from names like "Aegis Cryptographic Pipeline".
  [/\bAegis\b/g, 'KalderaShield'],
  // The encrypted export extension. ".aegis" also covers the German
  // ".aegis-Datei." and the sentence-final ".aegis." forms.
  [/\.aegis\b/g, '.ks'],
  // The "7" was part of the old product name, not a version. The application
  // itself is branded KalderaShield with no number, so the site says the same.
  // Turkish attaches its suffixes to the name, so "7'yi" becomes "'i" rather
  // than leaving a stranded "'yi" behind.
  [/KalderaShield 7'yi/g, "KalderaShield'i"],
  [/KalderaShield 7'nin/g, "KalderaShield'in"],
  [/KalderaShield 7/g, 'KalderaShield'],
];

const KEY_RENAMES = new Map([['comp-th-aegis', 'comp-th-kalderashield']]);

let totalValues = 0;
let totalKeys = 0;
const report = [];

for (const file of fs.readdirSync(SRC).filter((f) => f.endsWith('.json')).sort()) {
  const source = JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
  const out = {};
  let values = 0;
  let keys = 0;

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = KEY_RENAMES.get(rawKey) || rawKey;
    if (key !== rawKey) keys += 1;

    if (typeof rawValue !== 'string') {
      out[key] = rawValue;
      continue;
    }
    let value = rawValue;
    for (const [pattern, replacement] of RULES) {
      value = value.replace(pattern, replacement);
    }
    if (value !== rawValue) values += 1;
    out[key] = value;
  }

  fs.writeFileSync(
    path.join(DST, file),
    JSON.stringify(out, null, 2) + '\n',
    'utf8'
  );

  totalValues += values;
  totalKeys += keys;
  report.push(`  ${file.padEnd(9)} ${String(values).padStart(4)} deger  ${String(keys).padStart(2)} anahtar`);
}

console.log('Rebranded into kalderashield-website/assets/js/i18n:');
report.forEach((line) => console.log(line));
console.log(`  total: ${totalValues} deger, ${totalKeys} anahtar`);
