// Sürüm numarasını 12 çeviri dosyasından çıkarıp tek bir placeholder'a indir.
//
// Amaç: her release için aynı cümleyi 12 dosyada elle düzenlememek. Sürüm
// tek yerde, index.html üzerindeki data-site-version özniteliğinde tutulur.
//
// Desen dile bağlı değildir: "Sürüm", "Version", "バージョン", "버전" gibi
// farklı kelimelerin hepsini yakalamak yerine sürümün kendi biçimini
// (sayı.nokta.sayı.nokta.sayı) arar.

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'kalderashield-website', 'assets', 'js', 'i18n');
const VERSION_PATTERN = /\d+\.\d+\.\d+/;

let changed = 0;
const report = [];

for (const file of fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const full = path.join(DIR, file);
  const dict = JSON.parse(fs.readFileSync(full, 'utf8'));
  let touched = [];

  for (const [key, value] of Object.entries(dict)) {
    if (typeof value !== 'string') continue;
    if (value.includes('{{VERSION}}')) continue;

    const match = value.match(VERSION_PATTERN);
    if (!match) continue;

    // Only the release badge carries a version. Other strings contain
    // unrelated numbers (breach counts, Argon2 parameters, limits) and must
    // be left alone.
    if (!/badge|version|sürüm|vers/i.test(key)) continue;

    dict[key] = value.replace(VERSION_PATTERN, '{{VERSION}}');
    touched.push(key);
  }

  if (touched.length) {
    fs.writeFileSync(full, JSON.stringify(dict, null, 2) + '\n', 'utf8');
    changed += 1;
    report.push(`  ${file.padEnd(9)} ${touched.join(', ')}`);
  }
}

console.log(`${changed}/12 dosyada sürüm placeholder yapıldı:`);
report.forEach((line) => console.log(line));
