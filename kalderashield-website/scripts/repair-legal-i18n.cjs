// Repairs six corrupted translations in apply-legal-i18n.cjs.
//
// The batch was written in one pass and five strings picked up text from the
// wrong language mid-sentence -- a generation artefact, not a translation
// choice. They are found by script-contamination, not by reading: a value for
// `ar` containing Cyrillic, a value for `ja` containing Hangul, and so on.
//
//   node scripts/repair-legal-i18n.cjs
//
// Idempotent: running it twice changes nothing, because each replacement is
// keyed on a fragment that only exists while the corruption is present.

const fs = require('fs');

const FILE = 'C:/Users/hrn21/OneDrive/Desktop/aegisvaultv7/kalderashield-website/scripts/apply-legal-i18n.cjs';

const REPAIRS = [
  {
    locale: 'ja',
    key: 'privacy-p1-2',
    from: '保存されるデータは表示言語の_INTEGERのみです',
    to: '保存されるデータは表示言語の設定のみです',
    note: 'a template placeholder leaked into the Japanese string',
  },
  {
    locale: 'es',
    key: 'terms-p1-2',
    from: 'incluida la Hungry de merchantabilidad',
    to: 'incluida la comercionalización',
    note: 'a stray English word; merchantability is "comercionalización"',
  },
  {
    locale: 'ar',
    key: 'terms-p1-2',
    from: '</strong>adzерение844 responsible',
    to: '</strong> والنسخ الاحتياطي الآمن لكلمة المرور الرئيسية ومفتاح الاسترداد مسؤوليتك.',
    note: 'Cyrillic plus an English word where the Arabic sentence had to be finished',
  },
  {
    locale: 'ja',
    key: 'terms-p1-2',
    from: 'マスターパスワードとリカバリーキーを安全にバックアップ你自己的責任となります',
    to: 'マスターパスワードとリカバリーキーを安全にバックアップすることは利用者の責任です',
    note: 'Chinese text in the middle of the Japanese sentence',
  },
  {
    locale: 'ar',
    key: 'terms-p1-3',
    from: 'ولا يمكن ضمان سلامة الحزمuatu字的来源于第三方来源。',
    to: 'ولا يمكن ضمان سلامة الحزم التي تم الحصول عليها من مصادر خارجية.',
    note: 'Chinese text appended to the Arabic sentence',
  },
  {
    locale: 'ja',
    key: 'terms-p1-3',
    from: '第三方authentic sources から取得したパッケージの整合性は保証できません',
    to: '第三者のソースから取得したパッケージの整合性は保証できません',
    note: 'an English word in the middle of the Japanese sentence',
  },
];

let source = fs.readFileSync(FILE, 'utf8');
let applied = 0;
let alreadyClean = 0;

for (const repair of REPAIRS) {
  if (source.includes(repair.from)) {
    source = source.split(repair.from).join(repair.to);
    applied++;
    console.log(`  fixed    ${repair.locale} ${repair.key}  -- ${repair.note}`);
  } else if (source.includes(repair.to)) {
    alreadyClean++;
  } else {
    console.log(`  MISSING  ${repair.locale} ${repair.key}: neither the broken nor the repaired text is present`);
    process.exitCode = 1;
  }
}

if (applied > 0) {
  fs.writeFileSync(FILE, source, 'utf8');
}
console.log(`applied ${applied}, already correct ${alreadyClean}`);
